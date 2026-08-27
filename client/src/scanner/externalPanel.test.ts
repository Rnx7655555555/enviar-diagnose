import { describe, expect, it } from "vitest";
import { evaluateExternalPanel, findExternalPanelSignals, isExternalPanelSourcePath } from "./externalPanel";

describe("triagem de painel externo", () => {
  it("aceita somente relatórios fechados de instalação, processos e inicialização", () => {
    expect(isExternalPanelSourcePath("sysdiagnose/logs/MobileInstallation/mobile_installation.log.1")).toBe(true);
    expect(isExternalPanelSourcePath("sysdiagnose/ps.txt")).toBe(true);
    expect(isExternalPanelSourcePath("sysdiagnose/logs/WiFi/network.log")).toBe(false);
    expect(isExternalPanelSourcePath("sysdiagnose/Logs/McState/Shared/MCSettingsEvents.plist")).toBe(false);
  });

  it("ignora o bundle oficial do jogo e o aplicativo ExitLag", () => {
    const source = "sysdiagnose/logs/MobileInstallation/mobile_installation.log.1";
    const text = "MIInstallableBundle ID=com.dts.freefireth\nMIInstallableBundle ID=com.exitlag.gameboosterios";
    expect(findExternalPanelSignals(source, text)).toEqual([]);
  });

  it("registra instalador externo como revisão, sem confirmar painel", () => {
    const source = "sysdiagnose/logs/MobileInstallation/mobile_installation.log.1";
    const findings = findExternalPanelSignals(source, "MIInstallableBundle ID=com.rileytestut.AltStore");
    expect(findings[0]?.family).toBe("instalador");
    expect(evaluateExternalPanel(findings, 1).status).toBe("manual");
  });

  it("não confirma um nome técnico de painel encontrado em uma fonte isolada", () => {
    const findings = findExternalPanelSignals("sysdiagnose/ps.txt", "bundle identifier = com.example.freefire.cheat.panel");
    expect(findings[0]?.family).toBe("painel");
    expect(evaluateExternalPanel(findings, 1).status).toBe("manual");
  });

  it("confirma somente com famílias diferentes e fontes independentes", () => {
    const findings = [
      ...findExternalPanelSignals("sysdiagnose/ps.txt", "bundle identifier = com.example.freefire.cheat.panel"),
      ...findExternalPanelSignals("sysdiagnose/logs/MobileInstallation/mobile_installation.log.1", "MIInstallableBundle ID=com.rileytestut.AltStore"),
    ];
    expect(evaluateExternalPanel(findings, 2).status).toBe("yes");
  });
});
