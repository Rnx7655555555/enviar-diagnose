export const confidenceLevels = ["informativo", "baixa", "media", "alta", "confirmada"] as const;
export type ConfidenceLevel = (typeof confidenceLevels)[number];

export const indicatorTypes = [
  "plist-key",
  "plist-value",
  "string",
  "bundle-identifier",
  "domain",
  "ip",
  "certificate",
  "filename",
  "regex",
] as const;
export type IndicatorType = (typeof indicatorTypes)[number];

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
  isActive?: boolean;
};
