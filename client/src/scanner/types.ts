export const confidenceLevels = ["informativo", "baixa", "media", "alta", "confirmada"] as const;
export type ConfidenceLevel = (typeof confidenceLevels)[number];

export type IndicatorType = "plist-key" | "plist-value" | "string" | "bundle" | "domain" | "ip" | "certificate" | "filename" | "regex";

export type SignatureDefinition = {
  id: string;
  name: string;
  category: string;
  indicator: string;
  type: IndicatorType;
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
  score: number;
};

export type ScanResult = "clean" | "suspicious" | "evidence";

export type ScanReport = {
  id: string;
  fileName: string;
  fileSize: number;
  fileFormat: "tar.gz" | "zip";
  durationMs: number;
  createdAt: number;
  result: ScanResult;
  score: number;
  overallConfidence: ConfidenceLevel;
  processedFileCount: number;
  relevantFileCount: number;
  evidence: Evidence[];
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
