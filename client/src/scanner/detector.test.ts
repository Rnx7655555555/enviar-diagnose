import { describe, expect, it } from "vitest";
import { collectManualReviews, detectInContent, scoreReport } from "./detector";
import { parseFileValues } from "./parsers";
import type { PlistValue, SignatureDefinition } from "./types";

const source = "sysdiagnose/Logs/Mcstate/Shared/MCSettingsEvents.plist";
const systemProfileValue = (identifier: string): PlistValue => ({ path: `SystemProfileRecords.${identifier}`, key: "SystemProfileIdentifier", value: identifier, type: "dictionary-key" });
const clientRestrictionValue = (identifier: string): PlistValue => ({ path: `SystemClientRestrictions.${identifier}`, key: "SystemProfileIdentifier", value: identifier, type: "dictionary-key" });
const outsideValue = (identifier: string): PlistValue => ({ path: `SystemSettings.${identifier}`, key: "SystemProfileIdentifier", value: identifier, type: "dictionary-key" });

const exactRule = (overrides: Partial<SignatureDefinition> = {}): SignatureDefinition => ({
  id: "xtremo",
  name: "XTREMO",
  category: "XTREMO",
  indicator: "com.xtremo.mobile",
  type: "identifier",
  match: "exact",
  sources: ["MCSettingsEvents.plist"],
  expectedFiles: [],
  expectedKeys: ["SystemProfileIdentifier"],
  contextExpected: ["SystemProfile"],
  severity: "alta",
  baseConfidence: "alta",
  description: "",
  isWeak: false,
  weight: 0,
  ...overrides,
});

describe("scanner SystemProfile", () => {
  it("extrai apenas as chaves diretas do dicionário SystemProfile", () => {
    const xml = `<?xml version="1.0"?><plist version="1.0"><dict><key>SystemSettings</key><dict><key>com.xtremo.mobile</key><dict/></dict><key>SystemProfileRecords</key><dict><key>com.xtremo.mobile</key><dict><key>event</key><string>set</string></dict><key>3b039be0ec0f497867df7e62b4c24f179bf2d92a58e96626aa15270e94d4bfe6a</key><dict/></dict></dict></plist>`;
    const parsed = parseFileValues(source, new TextEncoder().encode(xml));
    expect(parsed.values.map(item => item.value)).toEqual(["com.xtremo.mobile", "3b039be0ec0f497867df7e62b4c24f179bf2d92a58e96626aa15270e94d4bfe6a"]);
    expect(parsed.values.every(item => item.path.startsWith("SystemProfileRecords"))).toBe(true);
  });

  it("extrai as chaves diretas de SystemClientRestrictions sem ler as chaves internas", () => {
    const xml = `<?xml version="1.0"?><plist version="1.0"><dict><key>SystemClientRestrictions</key><dict><key>com.xtremo.mobile</key><dict><key>clientRestrictions</key><dict><key>com.apple.ignore</key><dict/></dict></dict></dict></dict></plist>`;
    const parsed = parseFileValues(source, new TextEncoder().encode(xml));
    expect(parsed.values).toHaveLength(1);
    expect(parsed.values[0]?.value).toBe("com.xtremo.mobile");
    expect(parsed.values[0]?.path).toBe("SystemClientRestrictions.com.xtremo.mobile");
  });

  it("confirma somente um identificador completo no SystemProfile", () => {
    const values = [systemProfileValue("com.xtremo.mobile")];
    const evidence = detectInContent(source, "", values, [exactRule()]);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.match).toBe("EXATA");
    expect(scoreReport(evidence, []).result).toBe("yes");
  });

  it("confirma o mesmo identificador completo quando ele está em SystemClientRestrictions", () => {
    const values = [clientRestrictionValue("com.xtremo.mobile")];
    const evidence = detectInContent(source, "", values, [exactRule()]);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.reason).toContain("SystemClientRestrictions");
  });

  it("não classifica um pacote Apple normal de SystemClientRestrictions como revisão manual", () => {
    const values = [clientRestrictionValue("com.apple.batterysaver")];
    const evidence = detectInContent(source, "", values, [exactRule()]);
    expect(collectManualReviews(source, values, [exactRule()], evidence)).toHaveLength(0);
    expect(scoreReport(evidence, []).result).toBe("no");
  });

  it("ignora o mesmo identificador se ele estiver fora de SystemProfile", () => {
    const evidence = detectInContent(source, "", [outsideValue("com.xtremo.mobile")], [exactRule()]);
    expect(evidence).toHaveLength(0);
    expect(scoreReport(evidence, []).result).toBe("no");
  });

  it("nunca confirma o prefixo curto b4 de um identificador completo", () => {
    const identifier = "b4d039be0ec0f497867df7e62b4c24f179bf2d92a58e96626aa15270e94d4bfe6a";
    const prefix = exactRule({ id: "b4", name: "Referência · B4", indicator: "b4", match: "prefix", isWeak: true, severity: "informativo", baseConfidence: "informativo" });
    const values = [systemProfileValue(identifier)];
    const evidence = detectInContent(source, "", values, [prefix]);
    const manual = collectManualReviews(source, values, [prefix], evidence);
    expect(evidence).toHaveLength(0);
    expect(manual[0]?.reason).toContain("Prefixo de referência");
    expect(scoreReport(evidence, manual).result).toBe("manual");
  });

  it("mantém códigos curtos da tabela como revisão em SystemClientRestrictions", () => {
    const identifier = "7041149b4d039be0ec0f497867df7e62b4c24f179bf2d92a58e96626aa15270e94d4bfe6a";
    const prefix = exactRule({ id: "zeex-704", name: "Zeex Free/VIP · 704", category: "Zeex Free/VIP", indicator: "704", match: "prefix", isWeak: true, severity: "informativo", baseConfidence: "informativo" });
    const values = [clientRestrictionValue(identifier)];
    const evidence = detectInContent(source, "", values, [prefix]);
    const manual = collectManualReviews(source, values, [prefix], evidence);
    expect(evidence).toHaveLength(0);
    expect(manual[0]?.plistPath).toBe(`SystemClientRestrictions.${identifier}`);
    expect(scoreReport(evidence, manual).result).toBe("manual");
  });

  it("ignora por completo dados de outro arquivo e outras chaves", () => {
    const values = [systemProfileValue("com.xtremo.mobile")];
    expect(detectInContent("sysdiagnose/other.plist", "", values, [exactRule()])).toHaveLength(0);
    expect(detectInContent(source, "", [{ path: "SystemProfileRecords.com.xtremo.mobile", key: "HTTPProxy", value: "com.xtremo.mobile" }], [exactRule()])).toHaveLength(0);
  });
});
