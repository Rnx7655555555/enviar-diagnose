import { describe, expect, it } from "vitest";
import { createScanPlan } from "./capability";
import { TarWalker, type TarPath } from "./tar";

function join(...chunks: Uint8Array[]) {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}

function field(target: Uint8Array, offset: number, length: number, value: string) {
  target.set(new TextEncoder().encode(value).slice(0, length), offset);
}

function header(path: string, size: number, type = "0") {
  const value = new Uint8Array(512);
  field(value, 0, 100, path);
  field(value, 124, 12, `${size.toString(8).padStart(11, "0")}\0`);
  value[156] = type.charCodeAt(0);
  return value;
}

function padded(content: Uint8Array) {
  const result = new Uint8Array(Math.ceil(content.length / 512) * 512);
  result.set(content);
  return result;
}

describe("leitor TAR incremental", () => {
  it("ignora os registros PAX de metadados e conta cada arquivo real uma vez", async () => {
    const paths: TarPath[] = [];
    const visited: string[] = [];
    const walker = new TarWalker(paths, async path => { visited.push(path); }, () => true, createScanPlan(10_000), () => false);
    const archive = join(
      header("PaxHeader", 8, "x"), padded(new TextEncoder().encode("8 key=v\n")),
      header("sysdiagnose/McSettingsEvents.plist", 4), padded(new TextEncoder().encode("data")),
      new Uint8Array(1024),
    );
    await walker.push(archive.slice(0, 700));
    await walker.push(archive.slice(700));
    expect(paths).toEqual([{ path: "sysdiagnose/McSettingsEvents.plist", size: 4 }]);
    expect(visited).toEqual(["sysdiagnose/McSettingsEvents.plist"]);
  });
});
