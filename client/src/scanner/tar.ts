import type { ScanPlan } from "./capability";
import { safeArchivePath } from "./security";

export type TarPath = { path: string; size: number };
export type TarFileVisitor = (path: string, data: Uint8Array, truncated: boolean) => Promise<void>;
export type TarSourceMatcher = (path: string) => boolean;

function concat(first: Uint8Array, second: Uint8Array) {
  const joined = new Uint8Array(first.length + second.length);
  joined.set(first);
  joined.set(second, first.length);
  return joined;
}

function tarText(bytes: Uint8Array) { return new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/\0.*$/, "").trim(); }
function isEmptyTarBlock(block: Uint8Array) { return block.every(value => value === 0); }
function isExtendedMetadata(type: string) { return ["g", "x", "L", "K", "X"].includes(type); }

export class TarWalker {
  private buffer = new Uint8Array();
  private current: { path: string; size: number; remaining: number; padding: number; capture: Uint8Array[]; captureSize: number; inspect: boolean } | null = null;
  private entryCount = 0;
  private expanded = 0;
  private complete = false;

  constructor(
    private readonly paths: TarPath[],
    private readonly onFile: TarFileVisitor,
    private readonly shouldInspect: TarSourceMatcher,
    private readonly plan: ScanPlan,
    private readonly isCancelled: () => boolean,
  ) {}

  async push(input: Uint8Array) {
    if (this.complete || this.isCancelled()) return;
    this.buffer = concat(this.buffer, input);
    while (!this.isCancelled()) {
      if (!this.current) {
        if (this.buffer.length < 512) return;
        const header = this.buffer.slice(0, 512);
        this.buffer = this.buffer.slice(512);
        if (isEmptyTarBlock(header)) { this.complete = true; return; }
        this.entryCount += 1;
        if (this.entryCount > this.plan.maxEntries) throw new Error("O arquivo possui uma estrutura com entradas demais para ser analisada com segurança neste dispositivo.");
        const name = tarText(header.slice(0, 100));
        const prefix = tarText(header.slice(345, 500));
        const rawPath = prefix ? `${prefix}/${name}` : name;
        const path = safeArchivePath(rawPath);
        const size = Number.parseInt(tarText(header.slice(124, 136)) || "0", 8);
        const fileType = String.fromCharCode(header[156] || 0);
        const isRelativeRootDirectory = fileType === "5" && /^(?:\.\/)*\.?\/?$/.test(rawPath);
        if (isRelativeRootDirectory) continue;
        if (!path || !Number.isFinite(size) || size < 0) throw new Error("O arquivo contém uma entrada TAR inválida ou insegura.");
        const metadata = isExtendedMetadata(fileType);
        const directory = fileType === "5";
        if (!metadata) this.paths.push({ path, size: directory ? 0 : size });
        if (!metadata && !directory) {
          this.expanded += size;
          if (this.expanded > this.plan.maxExpandedBytes) throw new Error("A expansão do arquivo excedeu o orçamento estrutural seguro deste dispositivo. Tente fechar outros apps ou usar um aparelho com mais recursos.");
        }
        this.current = {
          path,
          size,
          remaining: size,
          padding: (512 - (size % 512)) % 512,
          capture: [],
          captureSize: 0,
          inspect: !metadata && !directory && this.shouldInspect(path),
        };
      }
      const entry = this.current;
      if (entry.remaining > 0) {
        if (!this.buffer.length) return;
        const count = Math.min(entry.remaining, this.buffer.length);
        const part = this.buffer.slice(0, count);
        this.buffer = this.buffer.slice(count);
        entry.remaining -= count;
        if (entry.inspect && entry.captureSize < this.plan.maxRelevantFileBytes) {
          const remainingBudget = this.plan.maxRelevantFileBytes - entry.captureSize;
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
      if (entry.inspect) await this.onFile(entry.path, entry.capture.length ? entry.capture.reduce(concat, new Uint8Array()) : new Uint8Array(), entry.captureSize < entry.size);
    }
  }
}
