import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import tar from "tar-stream";
import { describe, expect, it } from "vitest";
import { defaultSignatures } from "../signatures/defaultSignatures";
import { analyzeSysdiagnose } from "./engine";

async function createSysdiagnoseArchive(path: string) {
  const pack = tar.pack();
  pack.entry({ name: "sysdiagnose/McSettingsEvents.plist" }, `<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>HTTPProxy</key><string>dash-proxy</string></dict></plist>`);
  pack.entry({ name: "sysdiagnose/logs/irrelevant.txt" }, "diagnostic content");
  pack.finalize();
  await pipeline(pack, createGzip(), createWriteStream(path));
}

describe("análise incremental de Sysdiagnose", () => {
  it("processa um TAR.GZ real e gera evidência verificável apenas com contexto plist", async () => {
    const folder = await mkdtemp(join(tmpdir(), "rx7-engine-"));
    const archive = join(folder, "sysdiagnose.tar.gz");
    const signature = defaultSignatures.find(rule => rule.id === "rx7-dash-proxy");
    const stages: string[] = [];
    try {
      await createSysdiagnoseArchive(archive);
      const outcome = await analyzeSysdiagnose(archive, "tar.gz", [signature!], async (_progress, stage) => { stages.push(stage); });

      expect(outcome.processedFileCount).toBeGreaterThan(0);
      expect(outcome.relevantFileCount).toBeGreaterThan(0);
      expect(outcome.result).toBe("evidence");
      expect(outcome.evidence[0]).toMatchObject({ signature: { indicator: "dash-proxy" }, confidence: "alta", contextQuality: "verified", plistKey: "HTTPProxy" });
      expect(stages).toContain("Correlacionando evidências");
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });
});
