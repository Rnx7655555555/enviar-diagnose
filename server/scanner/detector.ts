import type { SignatureDefinition } from "../signatures/types";
import type { EvidenceCandidate, PlistValue } from "./types";

const MAX_MATCHES_PER_SIGNATURE = 1;

function escaped(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isShortIndicator(signature: SignatureDefinition) {
  return signature.isWeak || signature.indicator.length < 5;
}

function matchesPlainIndicator(value: string, indicator: string, exactToken: boolean) {
  if (!indicator) return false;
  if (!exactToken) return value.toLocaleLowerCase().includes(indicator.toLocaleLowerCase());
  return new RegExp(`(^|[^a-z0-9])${escaped(indicator)}($|[^a-z0-9])`, "i").test(value);
}

function matchesControlledRegex(value: string, pattern: string) {
  if (pattern.length > 160 || /(\.\*|\.\+|\([^)]*[+*][^)]*\)[+*])/.test(pattern)) return false;
  try {
    return new RegExp(pattern, "i").test(value);
  } catch {
    return false;
  }
}

function confidenceFor(score: number, signature: SignatureDefinition, contextSatisfied: boolean, contextQuality: EvidenceCandidate["contextQuality"]) {
  if (signature.baseConfidence === "informativo") return "informativo" as const;
  if (contextQuality === "isolated") return "baixa" as const;
  if (signature.isWeak && !contextSatisfied) return "baixa" as const;
  if (signature.isWeak) return score >= 7 ? "media" as const : "baixa" as const;
  if (contextQuality !== "verified") return score >= 8 ? "media" as const : "baixa" as const;
  if (score >= 12) return "alta" as const;
  if (score >= 8) return "media" as const;
  return "baixa" as const;
}

function nearbyContext(value: string, matched: string) {
  const at = value.toLocaleLowerCase().indexOf(matched.toLocaleLowerCase());
  if (at < 0) return value.slice(0, 380);
  const start = Math.max(0, at - 160);
  return value.slice(start, Math.min(value.length, at + matched.length + 220)).replace(/\s+/g, " ").trim();
}

function isCompatibleType(signature: SignatureDefinition, plistValue: PlistValue | null) {
  if (signature.type === "plist-key" || signature.type === "plist-value") return Boolean(plistValue);
  return true;
}

function candidateTarget(signature: SignatureDefinition, sourcePath: string, value: string, plistValue: PlistValue | null) {
  if (signature.type === "filename") return sourcePath;
  if (signature.type === "plist-key") return plistValue?.key ?? "";
  return value;
}

function buildEvidence(
  signature: SignatureDefinition,
  sourcePath: string,
  sourceFile: string,
  candidate: string,
  plistValue: PlistValue | null
): EvidenceCandidate | null {
  const target = candidateTarget(signature, sourcePath, candidate, plistValue);
  const matched = signature.type === "regex"
    ? matchesControlledRegex(target, signature.indicator)
    : matchesPlainIndicator(target, signature.indicator, isShortIndicator(signature));
  if (!matched) return null;

  const sourceExpected = signature.expectedFiles.some(item => sourcePath.toLocaleLowerCase().includes(item.toLocaleLowerCase()));
  const keyExpected = Boolean(plistValue?.key) && signature.expectedKeys.some(item => plistValue!.key.toLocaleLowerCase().includes(item.toLocaleLowerCase()));
  const contextWithoutIndicator = candidate.replace(new RegExp(escaped(signature.indicator), "ig"), " ");
  const contextHaystack = `${sourcePath} ${plistValue?.path ?? ""} ${contextWithoutIndicator}`.toLocaleLowerCase();
  const contextMatches = signature.contextExpected.filter(item => contextHaystack.includes(item.toLocaleLowerCase()));
  const contextSatisfied = sourceExpected && (keyExpected || contextMatches.length > 0);
  const contextQuality: EvidenceCandidate["contextQuality"] = sourceExpected && keyExpected
    ? "verified"
    : contextSatisfied || Boolean(plistValue && sourceExpected)
      ? "contextual"
      : "isolated";

  let score = signature.weight;
  if (sourceExpected) score += 2;
  if (keyExpected) score += 3;
  score += Math.min(3, contextMatches.length * 2);
  if (plistValue) score += 1;
  if (signature.isWeak && !contextSatisfied) score = Math.min(score, 2);

  const confidence = confidenceFor(score, signature, contextSatisfied, contextQuality);
  const why = [
    `Correspondência ${signature.type === "regex" ? "controlada" : "exata"} para “${signature.indicator}”.`,
    sourceExpected ? "O arquivo corresponde a um local esperado pela regra." : "O arquivo não é um local esperado pela regra.",
    keyExpected ? "A chave plist corresponde ao contexto esperado." : null,
    contextMatches.length ? `Contexto compatível: ${contextMatches.join(", ")}.` : null,
    signature.isWeak && !contextSatisfied ? "Indicador curto/genérico isolado; não é classificado como confirmação." : null,
  ].filter(Boolean).join(" ");

  return {
    signature,
    sourceFile,
    sourcePath,
    plistPath: plistValue?.path ?? null,
    plistKey: plistValue?.key ?? null,
    matchedValue: signature.type === "filename" ? sourceFile : (plistValue?.value ?? signature.indicator),
    context: nearbyContext(candidate, signature.indicator),
    confidence,
    contextQuality,
    score,
    reason: why,
  };
}

export function detectInContent(
  sourcePath: string,
  content: string,
  plistValues: PlistValue[],
  signatures: SignatureDefinition[]
) {
  const sourceFile = sourcePath.split("/").at(-1) ?? sourcePath;
  // Prefer structured key/value locations over broad file text so the most verifiable match is retained.
  const candidates: Array<{ value: string; plist: PlistValue | null }> = plistValues.map(item => ({ value: item.value, plist: item }));
  candidates.push({ value: content, plist: null });
  const evidence: EvidenceCandidate[] = [];

  for (const signature of signatures) {
    let matches = 0;
    for (const candidate of candidates) {
      if (matches >= MAX_MATCHES_PER_SIGNATURE || !isCompatibleType(signature, candidate.plist)) continue;
      const found = buildEvidence(signature, sourcePath, sourceFile, candidate.value, candidate.plist);
      if (found) {
        evidence.push(found);
        matches += 1;
      }
    }
  }
  return evidence;
}

function elevate(current: EvidenceCandidate["confidence"], ceiling: EvidenceCandidate["confidence"]) {
  const steps = ["informativo", "baixa", "media", "alta", "confirmada"] as const;
  const index = steps.indexOf(current);
  return steps[Math.min(index + 1, steps.indexOf(ceiling))];
}

/** Raises confidence only when independent rules from the same category corroborate one another. */
export function correlateEvidence(evidence: EvidenceCandidate[]) {
  const groups = new Map<string, EvidenceCandidate[]>();
  evidence.forEach(item => groups.set(item.signature.category, [...(groups.get(item.signature.category) ?? []), item]));
  Array.from(groups.values()).forEach((group: EvidenceCandidate[]) => {
    const distinctRules = new Set(group.map(item => item.signature.id));
    const sameRelevantFile = new Set(group.map(item => item.sourcePath)).size === 1;
    const corroborated = group.filter(item => item.contextQuality !== "isolated");
    const corroboratingRules = new Set(corroborated.map(item => item.signature.id));
    if (corroboratingRules.size >= 2 && sameRelevantFile) {
      group.forEach(item => {
        item.score += 2;
        if (item.confidence !== "informativo" && item.contextQuality !== "isolated") item.confidence = elevate(item.confidence, item.signature.isWeak ? "media" : "alta");
        item.reason += " Correlação: regras independentes da mesma categoria apareceram com contexto compatível no mesmo arquivo relevante.";
      });
    }
  });
  return evidence;
}
