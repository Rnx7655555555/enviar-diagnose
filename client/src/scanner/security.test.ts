import { describe, expect, it } from "vitest";
import { isRelevantSysdiagnosePath, safeArchivePath } from "./security";

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
});
