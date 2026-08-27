import type { Evidence, ManualReview, PlistValue, ScanResult, SignatureDefinition } from "./types";

const maxManualReviews = 80;
const normalized = (value: string) => value.trim().toLocaleLowerCase();
const basename = (path: string) => path.replace(/\\/g, "/").split("/").at(-1) ?? path;

export function isConfiguredSourcePath(sourcePath: string, _signatures: SignatureDefinition[]) {
  return /^mcsettingsevents\.plist$/i.test(basename(sourcePath));
}

function isAllowedStructuredValue(value: PlistValue) {
  return value.key === "SystemProfileIdentifier" && (value.path.startsWith("SystemProfile") || value.path.startsWith("SystemClientRestrictions."));
}

function blockName(value: PlistValue) {
  return value.path.split(".")[0] ?? "SystemProfile";
}

function exactEvidence(signature: SignatureDefinition, sourcePath: string, value: PlistValue): Evidence | null {
  if (signature.enabled === false || signature.match !== "exact" || signature.isWeak || !isAllowedStructuredValue(value)) return null;
  if (!signature.sources.some(source => normalized(source) === normalized(basename(sourcePath)))) return null;
  if (!signature.expectedKeys.includes(value.key)) return null;
  if (normalized(signature.indicator) !== normalized(value.value)) return null;
  return {
    category: signature.category,
    signature: signature.name,
    signatureId: signature.id,
    indicator: signature.indicator,
    severity: signature.severity,
    confidence: "alta",
    sourcePath,
    plistPath: value.path,
    plistKey: value.key,
    value: value.value,
    context: value.path,
    contextQuality: "verified",
    match: "EXATA",
    reason: `Identificador completo corresponde exatamente à regra “${signature.name}” no dicionário ${blockName(value)}.`,
  };
}

export function detectInContent(sourcePath: string, _content: string, values: PlistValue[], signatures: SignatureDefinition[]) {
  if (!isConfiguredSourcePath(sourcePath, signatures)) return [] as Evidence[];
  const evidence: Evidence[] = [];
  for (const value of values.filter(isAllowedStructuredValue)) {
    for (const signature of signatures) {
      const found = exactEvidence(signature, sourcePath, value);
      if (found) evidence.push(found);
    }
  }
  return evidence;
}

function matchingReferences(identifier: string, signatures: SignatureDefinition[]) {
  const value = normalized(identifier);
  return signatures.filter(signature => signature.enabled !== false && signature.match === "prefix" && signature.sources.some(source => normalized(source) === "mcsettingsevents.plist") && value.startsWith(normalized(signature.indicator))).map(signature => signature.name);
}

export function collectManualReviews(sourcePath: string, values: PlistValue[], signatures: SignatureDefinition[], confirmed: Evidence[]) {
  if (!isConfiguredSourcePath(sourcePath, signatures)) return [] as ManualReview[];
  const confirmedValues = new Set(confirmed.map(item => normalized(item.value)));
  const seen = new Set<string>();
  return values.filter(isAllowedStructuredValue).filter(value => !confirmedValues.has(normalized(value.value))).filter(value => {
    const id = normalized(value.value);
    if (seen.has(id)) return false;
    seen.add(id);
    return matchingReferences(value.value, signatures).length > 0 || /^[a-f\d]{32,}$/i.test(value.value);
  }).slice(0, maxManualReviews).map(value => {
    const references = matchingReferences(value.value, signatures);
    return {
      sourcePath,
      plistPath: value.path,
      plistKey: value.key,
      identifier: value.value,
      reason: references.length ? `Prefixo de referência encontrado: ${references.join(", ")}. O prefixo não é confirmação; valide o identificador completo.` : `Identificador completo de ${blockName(value)} fora da tabela de assinaturas exatas.`,
    };
  });
}

export function correlateEvidence(evidence: Evidence[]) { return evidence; }

export function scoreReport(evidence: Evidence[], manualReviews: ManualReview[]) {
  const result: ScanResult = evidence.length > 0 ? "yes" : manualReviews.length > 0 ? "manual" : "no";
  return { result };
}
