import type { PlistValue } from "./types";

const decoder = new TextDecoder("utf-8", { fatal: false });
const maxIdentifiers = 400;

function decodeXml(value: string) {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
}

function matchingDictEnd(text: string, openingDictIndex: number) {
  const tag = /<dict(?:\s[^>]*)?\/?\s*>|<\/dict>/gi;
  tag.lastIndex = openingDictIndex;
  let depth = 0;
  let match: RegExpExecArray | null;
  while ((match = tag.exec(text))) {
    if (match[0].startsWith("</")) depth -= 1;
    else if (!match[0].endsWith("/>")) depth += 1;
    if (depth === 0) return tag.lastIndex;
  }
  return -1;
}

function permittedBlocks(text: string) {
  const blocks: Array<{ name: string; xml: string }> = [];
  const key = /<key>\s*(SystemProfile[^<]*|SystemClientRestrictions)\s*<\/key>\s*(<dict(?:\s[^>]*)?>)/gi;
  let found: RegExpExecArray | null;
  while ((found = key.exec(text))) {
    const openingDictIndex = found.index + found[0].lastIndexOf(found[2]);
    const end = matchingDictEnd(text, openingDictIndex);
    if (end >= 0) blocks.push({ name: decodeXml(found[1]), xml: text.slice(openingDictIndex, end) });
  }
  return blocks;
}

function extractDirectIdentifierKeys(profileName: string, xml: string) {
  const values: PlistValue[] = [];
  const token = /<key>([\s\S]*?)<\/key>|<dict(?:\s[^>]*)?\/?\s*>|<\/dict>/gi;
  let depth = 0;
  let currentKey: string | null = null;
  let match: RegExpExecArray | null;
  while ((match = token.exec(xml)) && values.length < maxIdentifiers) {
    if (match[1] !== undefined) {
      if (depth === 1) currentKey = decodeXml(match[1]);
      continue;
    }
    if (match[0].startsWith("</")) {
      depth -= 1;
      continue;
    }
    if (depth === 1 && currentKey) {
      values.push({ path: `${profileName}.${currentKey}`, key: "SystemProfileIdentifier", value: currentKey, type: "dictionary-key" });
      currentKey = null;
    }
    if (!match[0].endsWith("/>")) depth += 1;
  }
  return values;
}

export function parseFileValues(path: string, data: Uint8Array) {
  const text = decoder.decode(data);
  const limitations: string[] = [];
  if (!/MCSettingsEvents\.plist$/i.test(path)) return { text: "", values: [] as PlistValue[], limitations };
  if (data[0] === 0x62 && data[1] === 0x70 && data[2] === 0x6c && data[3] === 0x69 && data[4] === 0x73 && data[5] === 0x74) {
    limitations.push(`${path}: plist binário identificado; os blocos SystemProfile e SystemClientRestrictions não podem ser lidos neste navegador.`);
    return { text: "", values: [] as PlistValue[], limitations };
  }
  if (!/<plist[\s>]/i.test(text)) {
    limitations.push(`${path}: XML plist inválido; nenhum identificador foi analisado.`);
    return { text: "", values: [] as PlistValue[], limitations };
  }
  const blocks = permittedBlocks(text);
  if (!blocks.length) {
    limitations.push(`${path}: SystemProfile e SystemClientRestrictions não foram encontrados; os demais dados foram ignorados.`);
    return { text: "", values: [] as PlistValue[], limitations };
  }
  return { text: "", values: blocks.flatMap(block => extractDirectIdentifierKeys(block.name, block.xml)).slice(0, maxIdentifiers), limitations };
}
