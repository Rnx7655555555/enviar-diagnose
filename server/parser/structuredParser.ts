import { XMLParser } from "fast-xml-parser";
import type { PlistValue } from "../scanner/types";

const MAX_DEPTH = 10;
const MAX_VALUES = 3_000;

function flatten(value: unknown, path: string, output: PlistValue[], depth: number): void {
  if (depth > MAX_DEPTH || output.length >= MAX_VALUES || value === null || value === undefined) return;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    const parts = path.split(".");
    output.push({ path, key: parts.at(-1) ?? "value", value: String(value) });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => flatten(item, `${path}[${index}]`, output, depth + 1));
    return;
  }
  if (typeof value === "object") Object.entries(value as Record<string, unknown>).forEach(([key, item]) => flatten(item, path ? `${path}.${key}` : key, output, depth + 1));
}

export function parseStructuredValues(sourcePath: string, content: string): PlistValue[] {
  const extension = sourcePath.toLocaleLowerCase().split(".").at(-1);
  const output: PlistValue[] = [];
  try {
    if (extension === "json") flatten(JSON.parse(content), "JSON", output, 0);
    if (extension === "xml" && !content.includes("<plist")) flatten(new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@" }).parse(content), "XML", output, 0);
  } catch {
    return [];
  }
  return output;
}
