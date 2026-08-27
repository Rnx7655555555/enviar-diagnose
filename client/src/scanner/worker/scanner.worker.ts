/// <reference lib="webworker" />
import { BlobReader, Uint8ArrayWriter, ZipReader } from "@zip.js/zip.js";
import { Gunzip } from "fflate";
import { collectManualReviews, correlateEvidence, detectInContent, isConfiguredSourcePath, scoreReport } from "../detector";
import { parseFileValues } from "../parsers";
import { buildTree, detectArchiveFormat, safeArchivePath, scanLimits } from "../security";
import type { Evidence, ManualReview, ScanReport, SignatureDefinition, WorkerEvent } from "../types";

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;
const decoder = new TextDecoder("utf-8", { fatal: false });
let cancelled = false;

type Progress = Omit<Extract<WorkerEvent, { type: "progress" }>, "type">;
type FileVisitor = (path: string, data: Uint8Array) => Promise<void>;
type SourceMatcher = (path: string) => boolean;

function emit(payload: Progress) { ctx.postMessage({ type: "progress", ...payload } satisfies WorkerEvent); }
function concat(first: Uint8Array, second: Uint8Array) { const joined = new Uint8Array(first.length + second.length); joined.set(first); joined.set(second, first.length); return joined; }
function tarText(bytes: Uint8Array) { return decoder.decode(bytes).replace(/\0.*$/, "").trim(); }
function isEmptyTarBlock(block: Uint8Array) { return block.every(value => value === 0); }

class TarWalker {
  private buffer = new Uint8Array();
  private current: { path: string; size: number; remaining: number; padding: number; capture: Uint8Array[]; captureSize: number } | null = null;
  private entryCount = 0;
  private expanded = 0;
  constructor(private readonly paths: Array<{ path: string; size: number }>, private readonly onFile: FileVisitor, private readonly shouldInspect: SourceMatcher) {}

  async push(input: Uint8Array) {
    this.buffer = concat(this.buffer, input);
    while (!cancelled) {
      if (!this.current) {
        if (this.buffer.length < 512) return;
        const header = this.buffer.slice(0, 512);
        this.buffer = this.buffer.slice(512);
        if (isEmptyTarBlock(header)) return;
        this.entryCount += 1;
        if (this.entryCount > scanLimits.maxEntries) throw new Error("O arquivo possui entradas demais para análise segura.");
        const name = tarText(header.slice(0, 100));
        const prefix = tarText(header.slice(345, 500));
        const rawPath = prefix ? `${prefix}/${name}` : name;
        const path = safeArchivePath(rawPath);
        const size = Number.parseInt(tarText(header.slice(124, 136)) || "0", 8);
        const fileType = String.fromCharCode(header[156] || 0);
        const isRelativeRootDirectory = fileType === "5" && /^(?:\.\/)*\.?\/?$/.test(rawPath);
        if (isRelativeRootDirectory) continue;
        if (!path || !Number.isFinite(size) || size < 0) throw new Error("O arquivo contém uma entrada TAR inválida ou insegura.");
        if (fileType === "5") { this.paths.push({ path, size: 0 }); continue; }
        this.expanded += size;
        if (this.expanded > scanLimits.maxExpandedBytes) throw new Error("A extração excederia o limite de segurança de 1,2 GB.");
        this.paths.push({ path, size });
        this.current = { path, size, remaining: size, padding: (512 - (size % 512)) % 512, capture: [], captureSize: 0 };
      }
      const entry = this.current;
      if (entry.remaining > 0) {
        if (!this.buffer.length) return;
        const count = Math.min(entry.remaining, this.buffer.length);
        const part = this.buffer.slice(0, count);
        this.buffer = this.buffer.slice(count);
        entry.remaining -= count;
        if (this.shouldInspect(entry.path) && entry.captureSize < scanLimits.maxRelevantFileBytes) {
          const remainingBudget = scanLimits.maxRelevantFileBytes - entry.captureSize;
          entry.capture.push(part.slice(0, remainingBudget));
          entry.captureSize += Math.min(part.length, remainingBudget);
        }
        if (entry.remaining > 0) return;
      }
      if (entry.padding > 0) {
        const count = Math.min(entry.padding, this.buffer.length);
        this.buffer = this.buffer.slice(count);
        entry.padding -= count;
        if (entry.padding > 0) return;
      }
      this.current = null;
      if (this.shouldInspect(entry.path)) await this.onFile(entry.path, entry.capture.length ? entry.capture.reduce(concat, new Uint8Array()) : new Uint8Array());
    }
  }
}

async function inspectTarGz(file: File, visit: FileVisitor, shouldInspect: SourceMatcher, update: (read: number) => void) {
  const paths: Array<{ path: string; size: number }> = [];
  const walker = new TarWalker(paths, visit, shouldInspect);
  let pending = Promise.resolve();
  const gunzip = new Gunzip((data) => { pending = pending.then(() => walker.push(data)); });
  for (let offset = 0; offset < file.size; offset += scanLimits.workerChunkBytes) {
    if (cancelled) return paths;
    const chunk = new Uint8Array(await file.slice(offset, Math.min(file.size, offset + scanLimits.workerChunkBytes)).arrayBuffer());
    gunzip.push(chunk, offset + chunk.length >= file.size);
    update(Math.min(file.size, offset + chunk.length));
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
  await pending;
  return paths;
}

async function inspectZip(file: File, visit: FileVisitor, shouldInspect: SourceMatcher, update: (read: number) => void) {
  const paths: Array<{ path: string; size: number }> = [];
  const reader = new ZipReader(new BlobReader(file));
  try {
    const entries = await reader.getEntries();
    if (entries.length > scanLimits.maxEntries) throw new Error("O arquivo possui entradas demais para análise segura.");
    const totalCompressed = entries.reduce((sum, item) => sum + (item.compressedSize ?? 0), 0) || file.size;
    let completedCompressed = 0;
    let expanded = 0;
    for (const entry of entries) {
      if (cancelled) break;
      const path = safeArchivePath(entry.filename);
      if (!path) throw new Error("O arquivo contém caminho ZIP inseguro.");
      const size = entry.uncompressedSize ?? 0;
      expanded += size;
      if (expanded > scanLimits.maxExpandedBytes) throw new Error("A extração excederia o limite de segurança de 1,2 GB.");
      paths.push({ path, size });
      if (!entry.directory && shouldInspect(path)) {
        if (size > scanLimits.maxRelevantFileBytes) throw new Error(`O arquivo relevante ${path} excede o limite seguro de 6 MB.`);
        const data = await entry.getData(new Uint8ArrayWriter(), { onprogress: (loaded) => update(Math.min(file.size, Math.round(((completedCompressed + Math.min(loaded, entry.compressedSize ?? loaded)) / totalCompressed) * file.size))) });
        await visit(path, data);
      }
      completedCompressed += entry.compressedSize ?? 0;
      update(Math.min(file.size, Math.round((completedCompressed / totalCompressed) * file.size)));
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
  } finally { await reader.close(); }
  return paths;
}

function recommendations(evidence: Evidence[], manualReviews: ManualReview[]) {
  if (evidence.length) return ["Revise os caminhos, chaves e identificadores completos exibidos antes de qualquer conclusão.", "O resultado é uma triagem técnica baseada em regras e não substitui análise forense ou diagnóstico definitivo."];
  if (manualReviews.length) return ["Existem identificadores estruturados sem regra RX7 exata; revise-os manualmente.", "A ausência de uma regra exata não equivale a uma detecção."];
  return ["Nenhuma assinatura válida foi encontrada nas fontes permitidas pelas regras ativas.", "Mantenha o arquivo original se for necessária uma análise independente."];
}

async function scan(file: File, signatures: SignatureDefinition[]) {
  const startedAt = Date.now();
  const format = await detectArchiveFormat(file);
  let processed = 0;
  let relevant = 0;
  const evidence: Evidence[] = [];
  const manualReviews: ManualReview[] = [];
  const limitations: string[] = [];
  const shouldInspect: SourceMatcher = path => isConfiguredSourcePath(path, signatures);
  const visit: FileVisitor = async (path, data) => {
    if (cancelled) return;
    processed += 1;
    relevant += 1;
    emit({ step: 4, stage: `Analisando ${path.split("/").at(-1) ?? "arquivo relevante"}`, processedFileCount: processed, relevantFileCount: relevant, bytesRead: 0, totalBytes: file.size });
    if (!data.length) { limitations.push(`${path}: o conteúdo excede o limite local de leitura segura e foi ignorado.`); return; }
    const parsed = parseFileValues(path, data);
    limitations.push(...parsed.limitations);
    const found = detectInContent(path, parsed.text, parsed.values, signatures);
    evidence.push(...found);
    manualReviews.push(...collectManualReviews(path, parsed.values, signatures, found));
  };
  emit({ step: 1, stage: "Detectando formato e validando cabeçalho", progress: 0, processedFileCount: 0, relevantFileCount: 0, bytesRead: 0, totalBytes: file.size });
  emit({ step: 2, stage: `Extraindo ${format === "zip" ? "ZIP" : "TAR.GZ"} localmente no dispositivo`, progress: 0, processedFileCount: 0, relevantFileCount: 0, bytesRead: 0, totalBytes: file.size });
  const update = (bytesRead: number) => emit({ step: 3, stage: "Localizando arquivos relevantes", progress: Math.round((bytesRead / file.size) * 100), processedFileCount: processed, relevantFileCount: relevant, bytesRead, totalBytes: file.size });
  const paths = format === "tar.gz" ? await inspectTarGz(file, visit, shouldInspect, update) : await inspectZip(file, visit, shouldInspect, update);
  if (cancelled) return;
  emit({ step: 5, stage: "Correlacionando evidências encontradas", processedFileCount: processed, relevantFileCount: relevant, bytesRead: file.size, totalBytes: file.size });
  correlateEvidence(evidence);
  const uniqueManualReviews = Array.from(new Map(manualReviews.map(item => [`${item.sourcePath}:${item.plistPath}:${item.identifier}`, item])).values());
  const outcome = scoreReport(evidence, uniqueManualReviews);
  const report: ScanReport = { id: crypto.randomUUID(), fileName: file.name, fileSize: file.size, fileFormat: format, durationMs: Date.now() - startedAt, createdAt: Date.now(), ...outcome, processedFileCount: paths.filter(item => item.path && !item.path.endsWith("/")).length, relevantFileCount: relevant, evidence, manualReviews: uniqueManualReviews, recommendations: recommendations(evidence, uniqueManualReviews), limitations: Array.from(new Set(limitations)), tree: buildTree(paths) };
  ctx.postMessage({ type: "complete", report } satisfies WorkerEvent);
}

ctx.onmessage = async (event: MessageEvent<{ type: "scan"; file: File; signatures: SignatureDefinition[] } | { type: "cancel" }>) => {
  if (event.data.type === "cancel") { cancelled = true; ctx.postMessage({ type: "cancelled" } satisfies WorkerEvent); return; }
  cancelled = false;
  try { await scan(event.data.file, event.data.signatures); } catch (error) { if (cancelled) ctx.postMessage({ type: "cancelled" } satisfies WorkerEvent); else ctx.postMessage({ type: "error", message: error instanceof Error ? error.message : "Não foi possível analisar o arquivo localmente." } satisfies WorkerEvent); }
};
