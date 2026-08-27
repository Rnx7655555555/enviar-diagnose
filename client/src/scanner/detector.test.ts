import { describe, expect, it } from "vitest";
import { collectManualReviews, detectInContent, scoreReport } from "./detector";
import type { PlistValue, SignatureDefinition } from "./types";

const source = "sysdiagnose/Logs/Mcstate/Shared/McSettingsEvents.plist";
const hashWithB4 = "3b039be0ec0f497867df7e62b4c24f179bf2d92a58e96626aa15270e94d4bfe6a";
const hashWithD4 = "06af329ab9f4bbde8551a7d25ad447e1a8427abb4d11ec938740ad071f26894da";

const rule = (overrides: Partial<SignatureDefinition> = {}): SignatureDefinition => ({
  id: "rule",
  name: "Regra de teste",
  category: "Teste",
  indicator: "dash-proxy",
  type: "plist-value",
  match: "exact",
  sources: ["McSettingsEvents.plist"],
  expectedKeys: ["HTTPProxy"],
  expectedFiles: ["McSettingsEvents.plist"],
  contextExpected: [],
  severity: "alta",
  baseConfidence: "alta",
  description: "",
  isWeak: false,
  weight: 0,
  ...overrides,
});

const value = (key: string, raw: string): PlistValue => ({ path: `Dictionary.${key}`, key, value: raw, type: "string" });

describe("detecção estruturada no navegador", () => {
  it("não confirma um identificador longo somente porque contém b4", () => {
    const signature = rule({ indicator: "b4", type: "identifier", expectedKeys: ["ProfileIdentifier"], expectedLengths: [2] });
    const values = [value("ProfileIdentifier", hashWithB4)];
    const evidence = detectInContent(source, hashWithB4, values, [signature]);
    const manual = collectManualReviews(source, values, [signature], evidence);
    expect(evidence).toHaveLength(0);
    expect(scoreReport(evidence, manual).result).toBe("manual");
  });

  it("não confirma um identificador longo somente porque contém d4", () => {
    const signature = rule({ indicator: "d4", type: "identifier", expectedKeys: ["ProfileIdentifier"], expectedLengths: [2] });
    const values = [value("ProfileIdentifier", hashWithD4)];
    const evidence = detectInContent(source, hashWithD4, values, [signature]);
    expect(evidence).toHaveLength(0);
    expect(scoreReport(evidence, collectManualReviews(source, values, [signature], evidence)).result).toBe("manual");
  });

  it("retorna SIM somente para correspondência exata na fonte e chave corretas", () => {
    const values = [value("HTTPProxy", "dash-proxy")];
    const evidence = detectInContent(source, "HTTPProxy=dash-proxy", values, [rule()]);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.match).toBe("EXATA");
    expect(scoreReport(evidence, []).result).toBe("yes");
  });

  it("não confirma hífen em campo que não é identificador estruturado nem regra Casa de Aposta", () => {
    const casa = rule({ name: "Casa de Aposta", category: "Casa de Aposta", indicator: "casa-704114-rx7", type: "identifier", expectedKeys: ["ProfileIdentifier"] });
    const values = [value("Description", "qualquer-texto-com-hifen")];
    const evidence = detectInContent(source, "qualquer-texto-com-hifen", values, [casa]);
    expect(evidence).toHaveLength(0);
    expect(scoreReport(evidence, collectManualReviews(source, values, [casa], evidence)).result).toBe("no");
  });

  it("retorna SIM para identificador Casa de Aposta completo cadastrado no local esperado", () => {
    const casa = rule({ name: "Casa de Aposta", category: "Casa de Aposta", indicator: "casa-704114-rx7", type: "identifier", expectedKeys: ["ProfileIdentifier"] });
    const values = [value("ProfileIdentifier", "casa-704114-rx7")];
    const evidence = detectInContent(source, "casa-704114-rx7", values, [casa]);
    expect(evidence[0]?.category).toBe("Casa de Aposta");
    expect(scoreReport(evidence, []).result).toBe("yes");
  });

  it("ignora string genérica quando ela aparece em arquivo não cadastrado", () => {
    const values = [value("HTTPProxy", "dash-proxy")];
    const evidence = detectInContent("sysdiagnose/Logs/other/random.log", "dash-proxy", values, [rule()]);
    expect(evidence).toHaveLength(0);
    expect(scoreReport(evidence, []).result).toBe("no");
  });
});
