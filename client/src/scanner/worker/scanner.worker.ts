/// <reference lib="webworker" />
import { BlobReader, Uint8ArrayWriter, ZipReader } from "@zip.js/zip.js";
import { Gunzip } from "fflate";
import { createScanPlan, type ScanPlan } from "../capability";
import { collectManualReviews, correlateEvidence, detectInContent, isConfiguredSourcePath, scoreReport } from "../detector";
import { assessExternalPanelCoverage, evaluateExternalPanel, findExternalPanelSignals, isExternalPanelSourcePath } from "../externalPanel";
import { evaluateJailbreak, findJailbreakSignals, isJailbreakSourcePath } from "../jailbreak";
import { parseFileValues } from "../parsers";
import { buildTree, detectArchiveFormat, safeArchivePath, scanLimits } from "../security";
import { TarWalker } from "../tar";
import type { Evidence, ExternalPanelFinding, JailbreakFinding, ManualReview, ScanReport, SignatureDefinition, WorkerEvent } from "../types";

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;
const decoder = new TextDecoder("utf-8", { fatal: false });
let cancelled = false;

type Progress = Omit<Extract<WorkerEvent, { type: "progress" }>, "type">;
type FileVisitor = (path: string, data: Uint8Array, truncated: boolean) => Promise<void>;
type SourceMatcher = (path: string) => boolean;

function emit(payload: Progress) { ctx.postMessage({ type: "progress", ...payload } satisfies WorkerEvent); }

async function inspectTarGz(file: File, visit: FileVisitor, shouldInspect: SourceMatcher, update: (read: number) => void, plan: ScanPlan) {
  const paths: Array<{ path: string; size: number }> = [];
  const walker = new TarWalker(paths, visit, shouldInspect, plan, () => cancelled);
  let pending = Promise.resolve();
  const gunzip = new Gunzip((data) => { pending = pending.then(() => walker.push(data)); });
  for (let offset = 0; offset < file.size; offset += plan.chunkBytes) {
    if (cancelled) return paths;
    const chunk = new Uint8Array(await file.slice(offset, Math.min(file.size, offset + plan.chunkBytes)).arrayBuffer());
    gunzip.push(chunk, offset + chunk.length >= file.size);
    update(Math.min(file.size, offset + chunk.length));
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
  await pending;
  return paths;
}

async function inspectTar(file: File, visit: FileVisitor, shouldInspect: SourceMatcher, update: (read: number) => void, plan: ScanPlan) {
  const paths: Array<{ path: string; size: number }> = [];
  const walker = new TarWalker(paths, visit, shouldInspect, plan, () => cancelled);
  for (let offset = 0; offset < file.size; offset += plan.chunkBytes) {
    if (cancelled) return paths;
    const chunk = new Uint8Array(await file.slice(offset, Math.min(file.size, offset + plan.chunkBytes)).arrayBuffer());
    await walker.push(chunk);
    update(Math.min(file.size, offset + chunk.length));
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
  return paths;
}

async function inspectZip(file: File, visit: FileVisitor, shouldInspect: SourceMatcher, update: (read: number) => void, plan: ScanPlan) {
  const paths: Array<{ path: string; size: number }> = [];
  const reader = new ZipReader(new BlobReader(file));
  try {
    const entries = await reader.getEntries();
    if (entries.length > plan.maxEntries) throw new Error("O arquivo possui uma estrutura com entradas demais para ser analisada com segurança neste dispositivo.");
    const totalCompressed = entries.reduce((sum, item) => sum + (item.compressedSize ?? 0), 0) || file.size;
    let completedCompressed = 0;
    let expanded = 0;
    for (const entry of entries) {
      if (cancelled) break;
      const path = safeArchivePath(entry.filename);
      if (!path) throw new Error("O arquivo contém caminho ZIP inseguro.");
      const size = entry.uncompressedSize ?? 0;
      expanded += size;
      if (expanded > plan.maxExpandedBytes) throw new Error("A expansão do arquivo excedeu o orçamento estrutural seguro deste dispositivo. Tente fechar outros apps ou usar um aparelho com mais recursos.");
      paths.push({ path, size });
      if (!entry.directory && shouldInspect(path)) {
        if (size > plan.maxRelevantFileBytes) {
          await visit(path, new Uint8Array(), true);
          completedCompressed += entry.compressedSize ?? 0;
          update(Math.min(file.size, Math.round((completedCompressed / totalCompressed) * file.size)));
          continue;
        }
        const data = await entry.getData(new Uint8ArrayWriter(), { onprogress: (loaded) => update(Math.min(file.size, Math.round(((completedCompressed + Math.min(loaded, entry.compressedSize ?? loaded)) / totalCompressed) * file.size))) });
        await visit(path, data, false);
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
  const plan = createScanPlan(file.size);
  let processed = 0;
  let relevant = 0;
  let limitedFiles = 0;
  let identifiersExtracted = 0;
  const evidence: Evidence[] = [];
  const manualReviews: ManualReview[] = [];
  const externalPanelFindings: ExternalPanelFinding[] = [];
  const jailbreakFindings: JailbreakFinding[] = [];
  const limitations: string[] = [];
  const externalPanelLimitations: string[] = [];
  const jailbreakLimitations: string[] = [];
  let externalPanelSourcesReviewed = 0;
  let jailbreakSourcesReviewed = 0;
  let lastProgressAt = 0;
  let lastProgress = -1;
  const emitProgress = (payload: Progress, force = false) => {
    const now = Date.now();
    const nextProgress = payload.progress ?? lastProgress;
    if (!force && nextProgress === lastProgress && now - lastProgressAt < 120) return;
    if (!force && nextProgress !== 100 && now - lastProgressAt < 120) return;
    lastProgressAt = now;
    lastProgress = nextProgress;
    emit(payload);
  };
  const shouldInspect: SourceMatcher = path => isConfiguredSourcePath(path, signatures) || isJailbreakSourcePath(path) || isExternalPanelSourcePath(path);
  const visit: FileVisitor = async (path, data, truncated) => {
    if (cancelled) return;
    processed += 1;
    relevant += 1;
    emitProgress({ step: 4, stage: `Conferindo ${path.split("/").at(-1) ?? "relatório técnico"}`, processedFileCount: processed, relevantFileCount: relevant, bytesRead: 0, totalBytes: file.size, analyzedFileCount: processed, currentFile: path }, true);
    if (!data.length || truncated) {
      limitedFiles += 1;
      const detail = `${path}: a fonte excede o orçamento local de leitura e foi registrada como cobertura limitada.`;
      if (isConfiguredSourcePath(path, signatures)) limitations.push(detail);
      if (isExternalPanelSourcePath(path)) externalPanelLimitations.push(detail);
      if (isJailbreakSourcePath(path)) jailbreakLimitations.push(detail);
      return;
    }
    if (isConfiguredSourcePath(path, signatures)) {
      const parsed = parseFileValues(path, data);
      limitations.push(...parsed.limitations);
      identifiersExtracted += parsed.values.length;
      const found = detectInContent(path, parsed.text, parsed.values, signatures);
      evidence.push(...found);
      manualReviews.push(...collectManualReviews(path, parsed.values, signatures, found));
    }
    if (isJailbreakSourcePath(path)) {
      jailbreakSourcesReviewed += 1;
      jailbreakFindings.push(...findJailbreakSignals(path, decoder.decode(data)));
    }
    if (isExternalPanelSourcePath(path)) {
      externalPanelSourcesReviewed += 1;
      externalPanelFindings.push(...findExternalPanelSignals(path, decoder.decode(data)));
    }
  };
  emitProgress({ step: 1, stage: "Preparando a análise local", progress: 0, processedFileCount: 0, relevantFileCount: 0, bytesRead: 0, totalBytes: file.size }, true);
  emitProgress({ step: 2, stage: `${format === "zip" ? "Lendo ZIP" : format === "tar" ? "Lendo TAR" : "Descompactando TAR.GZ"} no navegador`, progress: 0, processedFileCount: 0, relevantFileCount: 0, bytesRead: 0, totalBytes: file.size }, true);
  const update = (bytesRead: number) => emitProgress({ step: 3, stage: "Mapeando relatórios técnicos", progress: Math.round((bytesRead / file.size) * 100), processedFileCount: processed, relevantFileCount: relevant, bytesRead, totalBytes: file.size, analyzedFileCount: processed });
  const paths = format === "tar.gz" ? await inspectTarGz(file, visit, shouldInspect, update, plan) : format === "tar" ? await inspectTar(file, visit, shouldInspect, update, plan) : await inspectZip(file, visit, shouldInspect, update, plan);
  if (cancelled) return;
  emitProgress({ step: 5, stage: "Organizando o resultado técnico", progress: 100, processedFileCount: processed, relevantFileCount: relevant, bytesRead: file.size, totalBytes: file.size, discoveredFileCount: paths.length, analyzedFileCount: processed }, true);
  correlateEvidence(evidence);
  const uniqueManualReviews = Array.from(new Map(manualReviews.map(item => [`${item.sourcePath}:${item.plistPath}:${item.identifier}`, item])).values());
  const outcome = scoreReport(evidence, uniqueManualReviews);
  const externalPanel = evaluateExternalPanel(externalPanelFindings, externalPanelSourcesReviewed, Array.from(new Set(externalPanelLimitations)), assessExternalPanelCoverage(paths.map(item => item.path)));
  const jailbreak = evaluateJailbreak(jailbreakFindings, jailbreakSourcesReviewed, Array.from(new Set(jailbreakLimitations)));
  const totalFiles = paths.filter(item => item.path && !item.path.endsWith("/")).length;
  const coverage = {
    totalFiles,
    analyzedFiles: processed,
    ignoredFiles: Math.max(0, totalFiles - processed),
    plistFiles: paths.filter(item => /\.plist$/i.test(item.path)).length,
    profileFiles: paths.filter(item => /(?:\.mobileprovision|\.provisionprofile)$/i.test(item.path)).length,
    certificateFiles: paths.filter(item => /\.(?:cer|crt|pem|der)$/i.test(item.path)).length,
    identifiersExtracted,
    rulesExecuted: signatures.filter(item => item.enabled !== false).length,
    evidenceCount: evidence.length + uniqueManualReviews.length + externalPanel.findings.length + jailbreak.findings.length,
    limitedFiles,
  };
  const report: ScanReport = { id: crypto.randomUUID(), fileName: file.name, fileSize: file.size, fileFormat: format, durationMs: Date.now() - startedAt, createdAt: Date.now(), ...outcome, processedFileCount: totalFiles, relevantFileCount: relevant, evidence, manualReviews: uniqueManualReviews, jailbreak, externalPanel, coverage, capacity: { level: plan.level, chunkBytes: plan.chunkBytes, relevantFileBudget: plan.maxRelevantFileBytes, fallback: plan.fallback }, recommendations: recommendations(evidence, uniqueManualReviews), limitations: Array.from(new Set(limitations)), tree: buildTree(paths) };
  ctx.postMessage({ type: "complete", report } satisfies WorkerEvent);
}

ctx.onmessage = async (event: MessageEvent<{ type: "scan"; file: File; signatures: SignatureDefinition[] } | { type: "cancel" }>) => {
  if (event.data.type === "cancel") { cancelled = true; ctx.postMessage({ type: "cancelled" } satisfies WorkerEvent); return; }
  cancelled = false;
  try { await scan(event.data.file, event.data.signatures); } catch (error) { if (cancelled) ctx.postMessage({ type: "cancelled" } satisfies WorkerEvent); else { const rawMessage = error instanceof Error ? error.message : ""; const memoryIssue = error instanceof RangeError || /memory|allocation|out of memory/i.test(rawMessage); ctx.postMessage({ type: "error", message: memoryIssue ? "O dispositivo ou navegador não possui recursos suficientes para concluir esta análise neste momento. Feche outros apps e tente novamente." : rawMessage || "Não foi possível analisar o arquivo localmente." } satisfies WorkerEvent); } }
};
