import { describe, expect, it } from "vitest";
import { assertFileAccepted, isRelevantSysdiagnosePath, safeArchivePath } from "./security";

describe("segurança do scanner local", () => {
  it("remove caminhos perigosos de arquivo compactado", () => {
    expect(safeArchivePath("sysdiagnose/McSettingsEvents.plist")).toBe("sysdiagnose/McSettingsEvents.plist");
    expect(safeArchivePath("./sysdiagnose/McSettingsEvents.plist")).toBe("sysdiagnose/McSettingsEvents.plist");
    expect(safeArchivePath("../../etc/passwd")).toBeNull();
    expect(safeArchivePath("logs\\..\\private.txt")).toBeNull();
  });

  it("seleciona somente arquivos iOS relevantes e com formato suportado", () => {
    expect(isRelevantSysdiagnosePath("sysdiagnose/McSettingsEvents.plist")).toBe(true);
    expect(isRelevantSysdiagnosePath("sysdiagnose/Network/proxy.json")).toBe(true);
    expect(isRelevantSysdiagnosePath("sysdiagnose/photos/image.heic")).toBe(false);
  });

  it("não rejeita sysdiagnose apenas pelo tamanho do arquivo", () => {
    const large = new File([new Uint8Array(1)], "sysdiagnose.tar.gz");
    Object.defineProperty(large, "size", { value: 2 * 1024 * 1024 * 1024 });
    expect(() => assertFileAccepted(large)).not.toThrow();
  });

  it("mantém validação de arquivo vazio sem depender de extensão de nome", () => {
    expect(() => assertFileAccepted(new File([], "sysdiagnose.tar.gz"))).toThrow("vazio");
    expect(() => assertFileAccepted(new File([new Uint8Array(1)], "sysdiagnose.tar.gz.tar"))).not.toThrow();
  });
});
