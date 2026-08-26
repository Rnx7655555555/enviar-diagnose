import { describe, expect, it } from "vitest";
import { detectInContent } from "./detector";
import { defaultSignatures } from "../signatures/defaultSignatures";

describe("motor de detecção RX7", () => {
  it("trata um indicador curto isolado como evidência de baixa confiança", () => {
    const rule = defaultSignatures.find(item => item.id === "rx7-zeex-d4");
    expect(rule).toBeDefined();

    const evidence = detectInContent("logs/system.txt", "status d4 registrado", [], [rule!]);

    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.confidence).toBe("baixa");
    expect(evidence[0]?.score).toBeLessThanOrEqual(2);
    expect(evidence[0]?.reason).toContain("não é classificado como confirmação");
  });

  it("eleva a confiança apenas quando um indicador específico aparece em contexto plist compatível", () => {
    const rule = defaultSignatures.find(item => item.id === "rx7-dash-proxy");
    expect(rule).toBeDefined();

    const evidence = detectInContent(
      "sysdiagnose/McSettingsEvents.plist",
      "HTTPProxy dash-proxy",
      [{ path: "Dictionary.Network.HTTPProxy", key: "HTTPProxy", value: "dash-proxy" }],
      [rule!]
    );

    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.confidence).toBe("alta");
    expect(evidence[0]?.contextQuality).toBe("verified");
    expect(evidence[0]?.reason).toContain("chave plist corresponde ao contexto esperado");
  });

  it("não permite que a própria substring satisfaça o contexto de uma regra específica", () => {
    const rule = defaultSignatures.find(item => item.id === "rx7-dash-proxy");
    expect(rule).toBeDefined();

    const evidence = detectInContent("sysdiagnose/McSettingsEvents.log", "dash-proxy", [], [rule!]);

    expect(evidence).toHaveLength(0);
  });
});
