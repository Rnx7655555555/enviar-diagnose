import * as plist from "plist";
import type { PlistValue } from "../scanner/types";

const MAX_DEPTH = 12;
const MAX_VALUES = 4_000;

function scalarValue(value: unknown) {
  if (value === null) return "null";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function flatten(value: unknown, currentPath: string, output: PlistValue[], depth: number): void {
  if (depth > MAX_DEPTH || output.length >= MAX_VALUES) return;
  const scalar = scalarValue(value);
  if (scalar !== null) {
    const pieces = currentPath.split(".");
    output.push({ path: currentPath, key: pieces.at(-1) ?? "valor", value: scalar });
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((child, index) => flatten(child, `${currentPath}[${index}]`, output, depth + 1));
    return;
  }

  if (value && typeof value === "object") {
    Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
      flatten(child, currentPath ? `${currentPath}.${key}` : key, output, depth + 1);
    });
  }
}

/** Parses XML plist data only; binary or malformed payloads are left as opaque text. */
export function parsePlistValues(content: string): PlistValue[] {
  if (!content.includes("<plist") && !content.includes("<!DOCTYPE plist")) return [];
  try {
    const parsed = plist.parse(content) as unknown;
    const output: PlistValue[] = [];
    flatten(parsed, "Dictionary", output, 0);
    return output;
  } catch {
    return [];
  }
}
