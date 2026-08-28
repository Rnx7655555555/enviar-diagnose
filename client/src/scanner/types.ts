export const confidenceLevels = ["informativo", "baixa", "media", "alta", "confirmada"] as const;
export type ConfidenceLevel = (typeof confidenceLevels)[number];

export type IndicatorType = "plist-key" | "plist-value" | "identifier" | "filename";
export type MatchMode = "exact" | "prefix";

export type SignatureDefinition = {
  id: string;
  name: string;
  category: string;
  indicator: string;
  type: IndicatorType;
  match: MatchMode;
  sources: string[];
  expectedLengths?: number[];
  severity: "informativo" | "baixa" | "media" | "alta" | "critica";
  baseConfidence: ConfidenceLevel;
  expectedFiles: string[];
  expectedKeys: string[];
  contextExpected: string[];
  description: string;
  isWeak: boolean;
  weight: number;
  enabled?: boolean;
};

export type PlistValue = { path: string; key: string; value: string; type?: string };

export type ArchiveNode = { id: string; name: string; path: string; type: "directory" | "file"; size?: number; children?: ArchiveNode[] };

export type Evidence = {
  category: string;
  signature: string;
  signatureId: string;
  indicator: string;
  severity: SignatureDefinition["severity"];
  confidence: ConfidenceLevel;
  sourcePath: string;
  plistPath: string | null;
  plistKey: string | null;
  value: string;
  context: string;
  reason: string;
  contextQuality: "isolated" | "contextual" | "verified";
  match: "EXATA" | "PREFIXO";
};

export type ManualReview = {
  sourcePath: string;
  plistPath: string | null;
  plistKey: string | null;
  identifier: string;
  reason: string;
};

export type ScanResult = "no" | "yes" | "manual";

export type JailbreakResult = "no" | "yes" | "manual";

export type JailbreakFinding = {
  id: string;
  family: "gerenciador" | "framework" | "sistema" | "ferramenta";
  sourceKind: "processos" | "montagens" | "inicializacao" | "instalacao";
  sourcePath: string;
  label: string;
};

export type JailbreakReport = {
  status: JailbreakResult;
  findings: JailbreakFinding[];
  sourcesReviewed: number;
  limitations: string[];
  summary: string;
};

export type ExternalPanelResult = "no" | "yes" | "manual";

export type ExternalPanelFinding = {
  id: string;
  family: "instalador" | "painel" | "distribuicao" | "ferramenta" | "assinatura";
  sourceKind: "instalacao" | "processos" | "inicializacao" | "atividade" | "assinatura";
  sourcePath: string;
  indicator: string;
  label: string;
  assessment: "confirmada" | "revisar";
  matchType: "IDENTIFICADOR COMPLETO" | "CONTEXTO DE INSTALAÇÃO" | "SINAL ESTRUTURADO";
  rule: string;
  context?: string;
};

export type ExternalPanelCoverage = {
  status: "available" | "limited";
  sourceKinds: ExternalPanelFinding["sourceKind"][];
  note: string;
};

export type ExternalPanelReport = {
  status: ExternalPanelResult;
  findings: ExternalPanelFinding[];
  sourcesReviewed: number;
  limitations: string[];
  summary: string;
  coverage: ExternalPanelCoverage;
};

export type ScanReport = {
  id: string;
  fileName: string;
  fileSize: number;
  fileFormat: "tar.gz" | "zip";
  durationMs: number;
  createdAt: number;
  result: ScanResult;
  processedFileCount: number;
  relevantFileCount: number;
  evidence: Evidence[];
  manualReviews: ManualReview[];
  jailbreak: JailbreakReport;
  externalPanel: ExternalPanelReport;
  recommendations: string[];
  limitations: string[];
  tree: ArchiveNode[];
};

export type WorkerProgress = {
  type: "progress";
  step: number;
  stage: string;
  progress?: number;
  processedFileCount: number;
  relevantFileCount: number;
  bytesRead: number;
  totalBytes: number;
};

export type WorkerEvent = WorkerProgress | { type: "complete"; report: ScanReport } | { type: "error"; message: string; code?: string } | { type: "cancelled" };
