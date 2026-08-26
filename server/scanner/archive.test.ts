import { describe, expect, it } from "vitest";
import { ArchiveSafetyError, archiveFormat, assertArchiveHeader, isRelevantSysdiagnosePath, safeArchivePath } from "./archive";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("validação de arquivos compactados", () => {
  it("aceita somente os formatos compactados previstos", () => {
    expect(archiveFormat("sysdiagnose_2026.tar.gz")).toBe("tar.gz");
    expect(archiveFormat("sysdiagnose.tgz")).toBe("tar.gz");
    expect(archiveFormat("sysdiagnose.zip")).toBe("zip");
    expect(archiveFormat("arquivo.plist")).toBeNull();
  });

  it("rejeita caminhos com traversal e preserva caminhos internos seguros", () => {
    expect(safeArchivePath("../../etc/passwd")).toBeNull();
    expect(safeArchivePath("folder/../outside.plist")).toBe("outside.plist");
    expect(safeArchivePath("sysdiagnose/McSettingsEvents.plist")).toBe("sysdiagnose/McSettingsEvents.plist");
  });

  it("prioriza entradas relevantes de sysdiagnose", () => {
    expect(isRelevantSysdiagnosePath("sysdiagnose/McSettingsEvents.plist")).toBe(true);
    expect(isRelevantSysdiagnosePath("sysdiagnose/logs/network-state.log")).toBe(true);
    expect(isRelevantSysdiagnosePath("sysdiagnose/assets/photo.jpg")).toBe(false);
  });

  it("valida os magic bytes antes da extração", async () => {
    const folder = await mkdtemp(join(tmpdir(), "rx7-archive-"));
    const zip = join(folder, "scan.zip");
    const invalid = join(folder, "invalid.zip");
    try {
      await writeFile(zip, Buffer.from([0x50, 0x4b, 0x03, 0x04]));
      await writeFile(invalid, "não é um zip");
      await expect(assertArchiveHeader(zip, "zip")).resolves.toBeUndefined();
      await expect(assertArchiveHeader(invalid, "zip")).rejects.toBeInstanceOf(ArchiveSafetyError);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });
});
