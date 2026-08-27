import type { ConfidenceLevel, Evidence, PlistValue, SignatureDefinition } from "./types";

const maxMatchesPerSignature = 1;
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const isShort = (signature: SignatureDefinition) => signature.isWeak || signature.indicator.length < 5;

function matches(value: string, signature: SignatureDefinition) {
  if (signature.type === "regex") {
    if (signature.indicator.length > 160 || /(\.\*|\.\+|\([^)]*[+*][^)]*\)[+*])/.test(signature.indicator)) return false;
    try { return new RegExp(signature.indicator, "i").test(value); } catch { return false; }
  }
  if (!isShort(signature)) return value.toLowerCase().includes(signature.indicator.toLowerCase());
  return new RegExp(`(^|[^a-z0-9])${escapeRegex(signature.indicator)}($|[^a-z0-9])`, "i").test(value);
}

function confidence(score: number, signature: SignatureDefinition, quality: Evidence["contextQuality"]): ConfidenceLevel {
  if (signature.baseConfidence === "informativo") return "informativo";
  if (quality === "isolated" || (signature.isWeak && quality !== "verified")) return "baixa";
  if (quality === "contextual") return score >= 10 ? "media" : "baixa";
  if (score >= 12) return "alta";
  if (score >= 8) return "media";
  return "baixa";
}

function contextSnippet(content: string, indicator: string) {
  const found = content.toLowerCase().indexOf(indicator.toLowerCase());
  const start = Math.max(0, found < 0 ? 0 : found - 160);
  const end = Math.min(content.length, found < 0 ? 380 : found + indicator.length + 220);
  return content.slice(start, end).replace(/\s+/g, " ").trim();
}

function makeEvidence(signature: SignatureDefinition, sourcePath: string, candidate: string, plist: PlistValue | null): Evidence | null {
  const target = signature.type === "filename" ? sourcePath : signature.type === "plist-key" ? plist?.key ?? "" : candidate;
  if (!matches(target, signature)) return null;
  const sourceExpected = signature.expectedFiles.some(value => sourcePath.toLowerCase().includes(value.toLowerCase()));
  const keyExpected = Boolean(plist?.key) && signature.expectedKeys.some(value => (plist?.key ?? "").toLowerCase().includes(value.toLowerCase()));
  const withoutIndicator = candidate.replace(new RegExp(escapeRegex(signature.indicator), "ig"), " ");
  const haystack = `${sourcePath} ${plist?.path ?? ""} ${withoutIndicator}`.toLowerCase();
  const contextMatches = signature.contextExpected.filter(value => haystack.includes(value.toLowerCase()));
  const contextual = sourceExpected && (keyExpected || contextMatches.length > 0);
  const quality: Evidence["contextQuality"] = sourceExpected && keyExpected ? "verified" : contextual || Boolean(sourceExpected && plist) ? "contextual" : "isolated";
  let score = signature.weight + (sourceExpected ? 2 : 0) + (keyExpected ? 3 : 0) + Math.min(3, contextMatches.length * 2) + (plist ? 1 : 0);
  if (signature.isWeak && !contextual) score = Math.min(score, 2);
  const evidenceConfidence = confidence(score, signature, quality);
  return {
    category: signature.category, signature: signature.name, signatureId: signature.id, indicator: signature.indicator, severity: signature.severity,
    confidence: evidenceConfidence, sourcePath, plistPath: plist?.path ?? null, plistKey: plist?.key ?? null,
    value: signature.type === "filename" ? sourcePath.split("/").at(-1) ?? sourcePath : plist?.value ?? signature.indicator,
    context: contextSnippet(candidate, signature.indicator), contextQuality: quality, score,
    reason: [`Correspondência ${signature.type === "regex" ? "controlada" : "verificável"} para “${signature.indicator}”.`, sourceExpected ? "O arquivo é compatível com a regra." : "O arquivo não é um local esperado pela regra.", keyExpected ? "A chave estruturada é compatível." : null, contextMatches.length ? `Contexto compatível: ${contextMatches.join(", ")}.` : null, signature.isWeak && !contextual ? "Indicador curto/genérico isolado; não é confirmação." : null].filter(Boolean).join(" "),
  };
}

export function detectInContent(sourcePath: string, content: string, values: PlistValue[], signatures: SignatureDefinition[]) {
  const evidence: Evidence[] = [];
  const candidates = [...values.map(value => ({ content: value.value, plist: value })), { content, plist: null as PlistValue | null }];
  for (const signature of signatures.filter(item => item.enabled !== false)) {
    let found = 0;
    for (const candidate of candidates) {
      if (found >= maxMatchesPerSignature || ((signature.type === "plist-key" || signature.type === "plist-value") && !candidate.plist)) continue;
      const item = makeEvidence(signature, sourcePath, candidate.content, candidate.plist);
      if (item) { evidence.push(item); found += 1; }
    }
  }
  return evidence;
}

export function correlateEvidence(evidence: Evidence[]) {
  const groups = new Map<string, Evidence[]>();
  evidence.forEach(item => groups.set(item.category, [...(groups.get(item.category) ?? []), item]));
  for (const group of Array.from(groups.values())) {
    const corroborated = group.filter(item => item.contextQuality !== "isolated");
    const independentRules = new Set(corroborated.map(item => item.signatureId));
    const sameFile = new Set(corroborated.map(item => item.sourcePath)).size === 1;
    if (independentRules.size >= 2 && sameFile) for (const item of corroborated) {
      item.score += 2;
      if (item.confidence === "baixa") item.confidence = "media";
      else if (item.confidence === "media" && !item.indicator.match(/^.{1,4}$/)) item.confidence = "alta";
      item.reason += " Correlação: regras independentes da mesma categoria surgiram no mesmo arquivo com contexto compatível.";
    }
  }
  return evidence;
}

export function scoreReport(evidence: Evidence[]) {
  const meaningful = evidence.filter(item => item.confidence !== "informativo" && item.contextQuality !== "isolated");
  const score = Math.min(100, meaningful.reduce((total, item) => total + item.score, 0));
  const hasHigh = meaningful.some(item => item.confidence === "alta");
  const hasMedium = meaningful.some(item => item.confidence === "media");
  return { score, result: hasHigh ? "evidence" as const : hasMedium || evidence.some(item => item.confidence === "baixa") ? "suspicious" as const : "clean" as const, overallConfidence: hasHigh ? "alta" as const : hasMedium ? "media" as const : evidence.length ? "baixa" as const : "informativo" as const };
}
