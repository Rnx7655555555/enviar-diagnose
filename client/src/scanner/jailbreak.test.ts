import { describe, expect, it } from "vitest";
import { evaluateJailbreak, findJailbreakSignals, isJailbreakSourcePath } from "./jailbreak";

describe("análise separada de Jailbreak", () => {
  it("aceita somente a lista fechada de fontes passivas", () => {
    expect(isJailbreakSourcePath("sysdiagnose/ps.txt")).toBe(true);
    expect(isJailbreakSourcePath("sysdiagnose/summaries/launchdLogs.log")).toBe(true);
    expect(isJailbreakSourcePath("sysdiagnose/Logs/McState/Shared/MCSettingsEvents.plist")).toBe(false);
    expect(isJailbreakSourcePath("sysdiagnose/logs/WiFi/network.log")).toBe(false);
  });

  it("não confirma um único marcador técnico", () => {
    const findings = findJailbreakSignals("sysdiagnose/ps.txt", "processo em /var/jb/usr/bin/example");
    const report = evaluateJailbreak(findings, 1);
    expect(report.status).toBe("manual");
    expect(report.findings).toHaveLength(1);
  });

  it("não confirma dois marcadores da mesma família mesmo em fontes diferentes", () => {
    const findings = [
      ...findJailbreakSignals("sysdiagnose/ps.txt", "palera1n"),
      ...findJailbreakSignals("sysdiagnose/summaries/launchdLogs.log", "palera1n"),
    ];
    expect(evaluateJailbreak(findings, 2).status).toBe("manual");
  });

  it("confirma apenas famílias técnicas diferentes em fontes independentes", () => {
    const findings = [
      ...findJailbreakSignals("sysdiagnose/ps.txt", "processo em /var/jb/usr/bin/example"),
      ...findJailbreakSignals("sysdiagnose/summaries/launchdLogs.log", "ElleKit.dylib carregada"),
    ];
    const report = evaluateJailbreak(findings, 2);
    expect(report.status).toBe("yes");
    expect(report.findings.map(item => item.family)).toEqual(["sistema", "framework"]);
  });

  it("ignora texto de Jailbreak em arquivo fora da lista fechada", () => {
    expect(findJailbreakSignals("sysdiagnose/logs/WiFi/network.log", "palera1n /var/jb ElleKit.dylib")).toEqual([]);
  });
});
