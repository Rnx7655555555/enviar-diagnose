import { XMLParser } from "fast-xml-parser";
import type { PlistValue } from "./types";

const MAX_DEPTH = 16;
const MAX_VALUES = 1_200;
const decoder = new TextDecoder("utf-8", { fatal: false });

function scalar(value: unknown) {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function flatten(value: unknown, path: string, values: PlistValue[], key = "", depth = 0) {
  if (depth > MAX_DEPTH || values.length >= MAX_VALUES) return;
  const plain = scalar(value);
  if (plain) {
    values.push({ path, key: key || path.split(".").at(-1) || "value", value: plain });
    return;
  }
  if (Array.isArray(value)) value.forEach((entry, index) => flatten(entry, `${path}[${index}]`, values, key, depth + 1));
  else if (value && typeof value === "object") Object.entries(value as Record<string, unknown>).forEach(([childKey, entry]) => flatten(entry, path ? `${path}.${childKey}` : childKey, values, childKey, depth + 1));
}

function decodeXml(value: string) {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
}

function xmlPlistPairs(text: string) {
  const values: PlistValue[] = [];
  const pair = /<key>([\s\S]*?)<\/key>\s*<(string|integer|real|date|data|true|false)(?:\s[^>]*)?>([\s\S]*?)<\/\2>|<key>([\s\S]*?)<\/key>\s*<(true|false)\s*\/>/gi;
  let match: RegExpExecArray | null;
  while ((match = pair.exec(text)) && values.length < MAX_VALUES) {
    const key = decodeXml(match[1] ?? match[4] ?? "");
    const value = match[6] ? match[6] : decodeXml(match[3] ?? "");
    if (key) values.push({ path: `Dictionary.${key}`, key, value, type: match[2] ?? match[5] ?? "unknown" });
  }
  return values;
}

export function parseFileValues(path: string, data: Uint8Array) {
  const text = decoder.decode(data);
  const lower = path.toLowerCase();
  const limitations: string[] = [];
  if (data[0] === 0x62 && data[1] === 0x70 && data[2] === 0x6c && data[3] === 0x69 && data[4] === 0x73 && data[5] === 0x74) {
    limitations.push(`${path}: plist binário identificado; a leitura estruturada desse formato ainda não é suportada neste navegador.`);
    return { text: "", values: [] as PlistValue[], limitations };
  }
  if (lower.endsWith(".plist") && /<plist[\s>]/i.test(text)) return { text, values: xmlPlistPairs(text), limitations };
  const values: PlistValue[] = [];
  try {
    if (lower.endsWith(".json")) flatten(JSON.parse(text), "JSON", values);
    else if (lower.endsWith(".xml")) flatten(new XMLParser({ ignoreAttributes: false, parseTagValue: false, trimValues: true }).parse(text), "XML", values);
  } catch {
    limitations.push(`${path}: estrutura inválida; foi analisado apenas como texto quando aplicável.`);
  }
  return { text, values, limitations };
}
