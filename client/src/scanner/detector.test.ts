import { describe, expect, it } from "vitest";
import { detectInContent, scoreReport } from "./detector";
import type { SignatureDefinition } from "./types";

const weak: SignatureDefinition = { id: "weak", name: "Weak", category: "Test", indicator: "d4", type: "string", severity: "baixa", baseConfidence: "baixa", expectedFiles: ["McSettings"], expectedKeys: [], contextExpected: ["proxy"], description: "", isWeak: true, weight: 1 };
const dash: SignatureDefinition = { id: "dash", name: "DASH proxy", category: "DASH", indicator: "dash-proxy", type: "plist-value", severity: "alta", baseConfidence: "alta", expectedFiles: ["McSettingsEvents"], expectedKeys: ["HTTPProxy"], contextExpected: ["proxy"], description: "", isWeak: false, weight: 7 };

describe("detecção contextual no navegador", () => {
  it("mantém um indicador curto isolado como baixa confiança", () => {
    const evidence = detectInContent("logs/random.txt", "registro d4 sem outros sinais", [], [weak]);
    expect(evidence[0]?.confidence).toBe("baixa");
    expect(evidence[0]?.contextQuality).toBe("isolated");
    expect(scoreReport(evidence).score).toBe(0);
  });

  it("reconhece um indicador específico somente quando o contexto plist é verificável", () => {
    const evidence = detectInContent("sysdiagnose/McSettingsEvents.plist", "HTTPProxy=dash-proxy", [{ path: "Dictionary.HTTPProxy", key: "HTTPProxy", value: "dash-proxy" }], [dash]);
    expect(evidence[0]?.confidence).toBe("alta");
    expect(evidence[0]?.contextQuality).toBe("verified");
  });
});
