import { describe, expect, it } from "vitest";
import { assessExternalPanelCoverage, evaluateExternalPanel, findExternalPanelSignals, isExternalPanelSourcePath } from "./externalPanel";

describe("triagem de painel externo", () => {
  it("aceita somente relatórios fechados de instalação, execução, inicialização e assinaturas", () => {
    expect(isExternalPanelSourcePath("sysdiagnose/logs/MobileInstallation/mobile_installation.log.1")).toBe(true);
    expect(isExternalPanelSourcePath("sysdiagnose/ps.txt")).toBe(true);
    expect(isExternalPanelSourcePath("sysdiagnose/RunningBoard/RunningBoard_state.log")).toBe(true);
    expect(isExternalPanelSourcePath("sysdiagnose/profiles/external.mobileprovision")).toBe(true);
    expect(isExternalPanelSourcePath("sysdiagnose/logs/WiFi/network.log")).toBe(false);
    expect(isExternalPanelSourcePath("sysdiagnose/Logs/McState/Shared/MCSettingsEvents.plist")).toBe(false);
  });

  it("reconhece AccessibilityPrefs como fonte estruturada, mas não qualquer plist", () => {
    expect(isExternalPanelSourcePath("sysdiagnose_2026/logs/AccessibilityPrefs/com.apple.VoiceOverTouch.plist")).toBe(true);
    expect(isExternalPanelSourcePath("sysdiagnose/logs/OtherPrefs/com.apple.VoiceOverTouch.plist")).toBe(false);
  });

  it("confirma ESign em AccessibilityPrefs somente por CFBundleIdentifier completo estruturado", () => {
    const source = "sysdiagnose_2026/logs/AccessibilityPrefs/com.apple.VoiceOverTouch.plist";
    const xml = "<key>CFBundleIdentifier</key><string>com.esign.esign</string>";
    const findings = findExternalPanelSignals(source, xml);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.label).toContain("ESign");
    expect(findings[0]?.sourceKind).toBe("acessibilidade");
    expect(evaluateExternalPanel(findings, 1).status).toBe("yes");
    expect(findExternalPanelSignals(source, "texto esign com.esign.esign sem chave plist")).toEqual([]);
  });

  it("ignora o bundle oficial do jogo e o aplicativo ExitLag", () => {
    const source = "sysdiagnose/logs/MobileInstallation/mobile_installation.log.1";
    const text = "MIInstallableBundle ID=com.dts.freefireth\nMIInstallableBundle ID=com.exitlag.gameboosterios";
    expect(findExternalPanelSignals(source, text)).toEqual([]);
  });

  it("confirma ferramenta externa por bundle identifier completo, sem atribuir uso em jogo", () => {
    const source = "sysdiagnose/logs/MobileInstallation/mobile_installation.log.1";
    const findings = findExternalPanelSignals(source, "MIInstallableBundle ID=com.rileytestut.AltStore");
    expect(findings[0]?.family).toBe("instalador");
    expect(findings[0]?.assessment).toBe("confirmada");
    expect(evaluateExternalPanel(findings, 1).status).toBe("yes");
  });

  it("reconhece ESign apenas por identificador completo ou application identifier estruturado", () => {
    const installation = findExternalPanelSignals("sysdiagnose/logs/MobileInstallation/mobile_installation.log.1", "MIInstallableBundle ID=com.esign.esign");
    const profile = findExternalPanelSignals("sysdiagnose/profiles/test.mobileprovision", "<key>application-identifier</key><string>ABCDE12345.com.esign.esign</string>");
    expect(installation[0]?.label).toContain("ESign");
    expect(profile[0]?.matchType).toBe("IDENTIFICADOR COMPLETO");
    expect(evaluateExternalPanel(profile, 1).status).toBe("yes");
  });

  it("ignora gg.delta.bz por ser identificador do Delta/Roblox, não External de Free Fire", () => {
    const findings = findExternalPanelSignals("sysdiagnose/logs/MobileInstallation/mobile_installation.log.1", "MIInstallableBundle ID=gg.delta.bz");
    expect(findings).toEqual([]);
    expect(evaluateExternalPanel(findings, 1).status).toBe("no");
  });

  it("não confirma um nome técnico de painel encontrado em uma fonte isolada", () => {
    const findings = findExternalPanelSignals("sysdiagnose/ps.txt", "bundle identifier = com.example.freefire.cheat.panel");
    expect(findings[0]?.family).toBe("painel");
    expect(findings[0]?.assessment).toBe("revisar");
    expect(evaluateExternalPanel(findings, 1).status).toBe("manual");
  });

  it("marca XIT e external apenas quando são unidades completas de identificador estruturado", () => {
    const source = "sysdiagnose/ps.txt";
    const findings = findExternalPanelSignals(source, "bundle identifier = com.example.xit.external.panel");
    expect(findings[0]?.indicator).toBe("com.example.xit.external.panel");
    expect(evaluateExternalPanel(findings, 1).status).toBe("manual");
    expect(findExternalPanelSignals(source, "nota xitexternal e externalidade sem bundle")).toEqual([]);
  });

  it("ignora external, esign e xit quando aparecem apenas em texto, hash ou caminho sem estrutura", () => {
    const source = "sysdiagnose/logs/MobileInstallation/mobile_installation.log.1";
    const text = "nota: external esign xit\nhash=aff0e5ign\ncaminho=/tmp/external/xit";
    expect(findExternalPanelSignals(source, text)).toEqual([]);
  });

  it("marca instalação não-App-Store do bundle exato do Free Fire apenas para revisão", () => {
    const source = "sysdiagnose/logs/MobileInstallation/mobile_installation.log.1";
    const text = "MIInstallableBundle ID=com.dts.freefireth\nMIInstallationDomainDeveloper\nDistributor: Developer";
    const findings = findExternalPanelSignals(source, text);
    expect(findings[0]?.family).toBe("distribuicao");
    expect(evaluateExternalPanel(findings, 1).status).toBe("manual");
  });

  it("confirma sinais de painel apenas com famílias diferentes e fontes independentes", () => {
    const findings = [
      ...findExternalPanelSignals("sysdiagnose/ps.txt", "bundle identifier = com.example.freefire.cheat.panel"),
      ...findExternalPanelSignals("sysdiagnose/logs/MobileInstallation/mobile_installation.log.1", "MIInstallableBundle ID=com.dts.freefireth\nMIInstallationDomainDeveloper\nDistributor: Developer"),
    ];
    expect(evaluateExternalPanel(findings, 2).status).toBe("yes");
  });

  it("informa cobertura limitada sem tratar ausência de fonte como painel", () => {
    const coverage = assessExternalPanelCoverage(["sysdiagnose/logs/MobileInstallation/mobile_installation.log.1", "sysdiagnose/ps.txt"]);
    expect(coverage.status).toBe("limited");
    expect(coverage.note).toContain("não equivale a prova de limpeza");
    expect(evaluateExternalPanel([], 2, [], coverage).status).toBe("no");
  });

  it("reconhece cobertura passiva base quando as quatro fontes estão presentes", () => {
    const coverage = assessExternalPanelCoverage([
      "sysdiagnose/logs/MobileInstallation/mobile_installation.log.1",
      "sysdiagnose/ps.txt",
      "sysdiagnose/summaries/launchdLogs.log",
      "sysdiagnose/RunningBoard/RunningBoard_state.log",
    ]);
    expect(coverage.status).toBe("available");
    expect(coverage.sourceKinds).toEqual(["instalacao", "processos", "inicializacao", "atividade"]);
  });
});
