import type { Evidence, ManualReview, PlistValue, ScanResult, SignatureDefinition } from "./types";

const maxManualReviews = 40;
const normalized = (value: string) => value.trim().toLocaleLowerCase();
const basename = (path: string) => path.replace(/\\/g, "/").split("/").at(-1) ?? path;
const identifierPattern = /^(?:[a-f0-9]{32,128}|[a-z0-9]{4,}(?:-[a-z0-9]{2,}){1,})$/i;
const identifierKeyPattern = /(?:identifiers?|profile|payload|uuid|udid|bundle|certificate|application|app)(?:id|identifier)?$/i;

export function isConfiguredSourcePath(sourcePath: string, signatures: SignatureDefinition[]) {
  const source = normalized(basename(sourcePath));
  return signatures.some(signature => signature.enabled !== false && signature.sources.some(allowed => source === normalized(allowed)));
}

function isExpectedSource(sourcePath: string, signature: SignatureDefinition) {
  const source = normalized(basename(sourcePath));
  return signature.sources.some(allowed => source === normalized(allowed));
}

function isExpectedKey(value: PlistValue, signature: SignatureDefinition) {
  return signature.expectedKeys.length === 0 || signature.expectedKeys.some(key => normalized(key) === normalized(value.key));
}

function matchesCandidate(value: string, signature: SignatureDefinition) {
  const candidate = normalized(value);
  const indicator = normalized(signature.indicator);
  if (!candidate || !indicator) return false;
  if (signature.match === "prefix" && (!signature.expectedLengths?.length || signature.expectedKeys.length === 0)) return false;
  if (signature.expectedLengths?.length && !signature.expectedLengths.includes(value.length)) return false;
  if (signature.type === "identifier" && !identifierPattern.test(value)) return false;
  return signature.match === "prefix" ? candidate.startsWith(indicator) : candidate === indicator;
}

function contextSnippet(value: string) {
  return value.length > 300 ? `${value.slice(0, 297)}...` : value;
}

function makeEvidence(signature: SignatureDefinition, sourcePath: string, plist: PlistValue): Evidence | null {
  const target = signature.type === "plist-key" ? plist.key : signature.type === "filename" ? basename(sourcePath) : plist.value;
  if (!isExpectedSource(sourcePath, signature) || !isExpectedKey(plist, signature) || !matchesCandidate(target, signature)) return null;
  return {
    category: signature.category,
    signature: signature.name,
    signatureId: signature.id,
    indicator: signature.indicator,
    severity: signature.severity,
    confidence: "alta",
    sourcePath,
    plistPath: plist.path,
    plistKey: plist.key,
    value: plist.value,
    context: contextSnippet(plist.value),
    contextQuality: "verified",
    match: signature.match === "prefix" ? "PREFIXO" : "EXATA",
    reason: `Correspondência ${signature.match === "prefix" ? "por prefixo com estrutura exigida" : "EXATA"} para a regra “${signature.name}”, no arquivo permitido e na chave estruturada esperada.`,
  };
}

function isCandidateIdentifier(value: PlistValue) {
  return identifierPattern.test(value.value) && identifierKeyPattern.test(value.key);
}

function manualReview(sourcePath: string, value: PlistValue): ManualReview {
  return {
    sourcePath,
    plistPath: value.path,
    plistKey: value.key,
    identifier: value.value,
    reason: "Identificador estruturado encontrado em uma fonte permitida, mas não há correspondência EXATA ativa na tabela RX7.",
  };
}

export function detectInContent(sourcePath: string, _content: string, values: PlistValue[], signatures: SignatureDefinition[]) {
  const evidence: Evidence[] = [];
  if (!isConfiguredSourcePath(sourcePath, signatures)) return evidence;
  for (const signature of signatures.filter(item => item.enabled !== false)) {
    const match = values.find(value => makeEvidence(signature, sourcePath, value));
    if (match) evidence.push(makeEvidence(signature, sourcePath, match)!);
  }
  return evidence;
}

export function collectManualReviews(sourcePath: string, values: PlistValue[], signatures: SignatureDefinition[], confirmed: Evidence[]) {
  if (!isConfiguredSourcePath(sourcePath, signatures)) return [] as ManualReview[];
  const confirmedValues = new Set(confirmed.filter(item => item.sourcePath === sourcePath).map(item => normalized(item.value)));
  const seen = new Set<string>();
  return values.filter(isCandidateIdentifier).filter(value => !confirmedValues.has(normalized(value.value))).filter(value => {
    const key = `${value.key}:${normalized(value.value)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, maxManualReviews).map(value => manualReview(sourcePath, value));
}

export function correlateEvidence(evidence: Evidence[]) { return evidence; }

export function scoreReport(evidence: Evidence[], manualReviews: ManualReview[]) {
  const result: ScanResult = evidence.length > 0 ? "yes" : manualReviews.length > 0 ? "manual" : "no";
  return { result };
}
