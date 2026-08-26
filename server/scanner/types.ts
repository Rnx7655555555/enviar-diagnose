import type { ConfidenceLevel, SignatureDefinition } from "../signatures/types";

export type PlistValue = {
  path: string;
  key: string;
  value: string;
};

export type EvidenceCandidate = {
  signature: SignatureDefinition;
  sourceFile: string;
  sourcePath: string;
  plistPath: string | null;
  plistKey: string | null;
  matchedValue: string;
  context: string;
  confidence: ConfidenceLevel;
  contextQuality: "isolated" | "contextual" | "verified";
  score: number;
  reason: string;
};

export type ScanOutcome = {
  evidence: EvidenceCandidate[];
  processedFileCount: number;
  relevantFileCount: number;
  aggregateScore: number;
  result: "clean" | "suspicious" | "evidence";
};
