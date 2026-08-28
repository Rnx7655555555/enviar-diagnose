import { describe, expect, it } from "vitest";
import { assertFileAccepted, detectArchiveFormat, isRelevantSysdiagnosePath, safeArchivePath } from "./security";

function tarHeader(path: string) {
  const header = new Uint8Array(512);
  header.set(new TextEncoder().encode(path), 0);
  header.set(new TextEncoder().encode("00000000000\0"), 124);
  header[156] = "0".charCodeAt(0);
  header.set(new TextEncoder().encode("ustar"), 257);
  header.fill(0x20, 148, 156);
  const checksum = header.reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, "0");
  header.set(new TextEncoder().encode(`${checksum}\0 `), 148);
  return header;
}

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

  it("reconhece TAR bruto pelo cabeçalho, sem confiar na extensão", async () => {
    const archive = new File([tarHeader("sysdiagnose/McSettingsEvents.plist")], "diagnose.bin");
    await expect(detectArchiveFormat(archive)).resolves.toBe("tar");
  });
});
