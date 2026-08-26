import { createReadStream } from "node:fs";
import { open } from "node:fs/promises";
import { basename, extname, posix } from "node:path";
import { StringDecoder } from "node:string_decoder";
import { createGunzip } from "node:zlib";
import tar from "tar-stream";
import unzipper from "unzipper";

export const scanLimits = {
  maxUploadBytes: 200 * 1024 * 1024,
  maxEntries: 12_000,
  maxExpandedBytes: 700 * 1024 * 1024,
  maxRelevantFileBytes: 4 * 1024 * 1024,
};

export class ArchiveSafetyError extends Error {}

export function archiveFormat(fileName: string) {
  const name = fileName.toLocaleLowerCase();
  if (name.endsWith(".tar.gz") || name.endsWith(".tgz")) return "tar.gz" as const;
  if (name.endsWith(".zip")) return "zip" as const;
  return null;
}

/** Verifies archive magic bytes before a scan is persisted or extracted. */
export async function assertArchiveHeader(filePath: string, format: "tar.gz" | "zip") {
  const handle = await open(filePath, "r");
  try {
    const header = Buffer.alloc(4);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    const gzip = bytesRead >= 2 && header[0] === 0x1f && header[1] === 0x8b;
    const zip = bytesRead === 4 && header[0] === 0x50 && header[1] === 0x4b && header[2] === 0x03 && header[3] === 0x04;
    if ((format === "tar.gz" && !gzip) || (format === "zip" && !zip)) throw new ArchiveSafetyError("O conteúdo não corresponde ao formato compactado informado.");
  } finally {
    await handle.close();
  }
}

export function safeArchivePath(value: string) {
  const normalized = posix.normalize(value.replace(/\\/g, "/")).replace(/^\/+/, "");
  if (!normalized || normalized === "." || normalized.startsWith("../") || normalized.includes("/../") || value.includes("\0")) return null;
  return normalized;
}

export function isRelevantSysdiagnosePath(sourcePath: string) {
  const value = sourcePath.toLocaleLowerCase();
  const name = basename(value);
  const relevantNames = ["mcsettings", "mcprofile", "systemprofile", "certificate", "trust", "network", "proxy", "preferences", "configuration", "profile"];
  const extension = extname(name);
  return relevantNames.some(token => value.includes(token)) || [".plist", ".xml", ".json", ".log", ".txt"].includes(extension);
}

async function readTextStream(stream: NodeJS.ReadableStream, maxBytes: number) {
  let size = 0;
  const chunks: string[] = [];
  const decoder = new StringDecoder("utf8");
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) throw new ArchiveSafetyError("Um arquivo relevante excede o limite seguro de leitura.");
    chunks.push(decoder.write(buffer));
  }
  chunks.push(decoder.end());
  const text = chunks.join("");
  if (text.includes("\0")) return "";
  return text;
}

type ArchiveEntryCallback = (entry: { sourcePath: string; text: string }) => Promise<void>;

export async function inspectTarGz(filePath: string, onRelevantEntry: ArchiveEntryCallback, signal?: AbortSignal) {
  let entryCount = 0;
  let expandedBytes = 0;
  const extractor = tar.extract();
  const source = createReadStream(filePath);
  const gunzip = createGunzip();

  await new Promise<void>((resolve, reject) => {
    const stop = (error: Error) => {
      source.destroy(error);
      gunzip.destroy(error);
      extractor.destroy(error);
      reject(error);
    };
    signal?.addEventListener("abort", () => stop(new ArchiveSafetyError("Scan cancelado pelo usuário.")), { once: true });
    extractor.on("entry", (header, entry, next) => {
      void (async () => {
        try {
          if (signal?.aborted) throw new ArchiveSafetyError("Scan cancelado pelo usuário.");
          entryCount += 1;
          if (entryCount > scanLimits.maxEntries) throw new ArchiveSafetyError("O arquivo possui entradas demais para análise segura.");
          const sourcePath = safeArchivePath(header.name);
          if (!sourcePath || header.type !== "file") {
            entry.resume();
            next();
            return;
          }
          expandedBytes += Number(header.size ?? 0);
          if (expandedBytes > scanLimits.maxExpandedBytes) throw new ArchiveSafetyError("A expansão excede o limite configurado de segurança.");
          if (!isRelevantSysdiagnosePath(sourcePath) || Number(header.size ?? 0) > scanLimits.maxRelevantFileBytes) {
            entry.resume();
            next();
            return;
          }
          const text = await readTextStream(entry as unknown as NodeJS.ReadableStream, scanLimits.maxRelevantFileBytes);
          await onRelevantEntry({ sourcePath, text });
          next();
        } catch (error) {
          stop(error instanceof Error ? error : new Error("Falha ao processar entrada TAR."));
        }
      })();
    });
    extractor.once("finish", resolve);
    extractor.once("error", reject);
    source.once("error", reject);
    gunzip.once("error", reject);
    source.pipe(gunzip).pipe(extractor);
  });
}

export async function inspectZip(filePath: string, onRelevantEntry: ArchiveEntryCallback, signal?: AbortSignal) {
  const directory = await unzipper.Open.file(filePath);
  if (directory.files.length > scanLimits.maxEntries) throw new ArchiveSafetyError("O arquivo possui entradas demais para análise segura.");
  let expandedBytes = 0;
  for (const entry of directory.files) {
    if (signal?.aborted) throw new ArchiveSafetyError("Scan cancelado pelo usuário.");
    const sourcePath = safeArchivePath(entry.path);
    const size = Number(entry.uncompressedSize ?? 0);
    expandedBytes += size;
    if (expandedBytes > scanLimits.maxExpandedBytes) throw new ArchiveSafetyError("A expansão excede o limite configurado de segurança.");
    if (!sourcePath || entry.type !== "File" || !isRelevantSysdiagnosePath(sourcePath) || size > scanLimits.maxRelevantFileBytes) continue;
    const text = await readTextStream(entry.stream() as unknown as NodeJS.ReadableStream, scanLimits.maxRelevantFileBytes);
    await onRelevantEntry({ sourcePath, text });
  }
}
