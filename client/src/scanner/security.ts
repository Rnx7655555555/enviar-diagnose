export const scanLimits = {
  maxTreeNodes: 2_000,
} as const;

import type { ArchiveFormat } from "./types";

export function safeArchivePath(input: string) {
  const normalized = input.replace(/\\/g, "/").replace(/^\/+/, "").replace(/^(\.\/)+/, "");
  if (!normalized || normalized.includes("\0") || normalized.split("/").some(part => part === "..")) return null;
  return normalized.replace(/\/+/g, "/");
}

export function isRelevantSysdiagnosePath(input: string) {
  const path = input.toLowerCase();
  const named = ["mcsettings", "mcprofile", "systemprofile", "configuration", "certificate", "cert", "trust", "network", "proxy", "preference", "mdm"];
  const acceptedExtension = /\.(plist|xml|json|log|txt)$/i.test(path);
  return acceptedExtension && named.some(token => path.includes(token));
}

export async function detectArchiveFormat(file: File): Promise<ArchiveFormat> {
  if (file.size < 4) throw new Error("O arquivo está vazio ou incompleto.");
  const header = new Uint8Array(await file.slice(0, Math.min(file.size, 512)).arrayBuffer());
  const isGzip = header[0] === 0x1f && header[1] === 0x8b;
  const isZip = header[0] === 0x50 && header[1] === 0x4b && [0x03, 0x05, 0x07].includes(header[2] ?? -1);
  const storedChecksum = Number.parseInt(new TextDecoder().decode(header.slice(148, 156)).replace(/\0.*$/, "").trim(), 8);
  const calculatedChecksum = header.length === 512 ? header.reduce((sum, byte, index) => sum + (index >= 148 && index < 156 ? 0x20 : byte), 0) : Number.NaN;
  const isTar = Number.isFinite(storedChecksum) && storedChecksum === calculatedChecksum;
  if (isGzip) return "tar.gz";
  if (isZip) return "zip";
  if (isTar) return "tar";
  throw new Error("O conteúdo não corresponde a um arquivo GZIP, TAR ou ZIP válido.");
}

export function assertFileAccepted(file: File) {
  if (file.size <= 0) throw new Error("O arquivo está vazio ou incompleto.");
}

export function buildTree(paths: Array<{ path: string; size?: number }>) {
  const roots: import("./types").ArchiveNode[] = [];
  const index = new Map<string, import("./types").ArchiveNode>();
  for (const { path, size } of paths.slice(0, scanLimits.maxTreeNodes)) {
    const chunks = path.split("/").filter(Boolean);
    let prefix = "";
    let children = roots;
    for (let position = 0; position < chunks.length; position += 1) {
      const name = chunks[position]!;
      prefix = prefix ? `${prefix}/${name}` : name;
      let node = index.get(prefix);
      if (!node) {
        const directory = position < chunks.length - 1;
        node = { id: prefix, name, path: prefix, type: directory ? "directory" : "file", ...(directory ? { children: [] } : { size }) };
        index.set(prefix, node);
        children.push(node);
      }
      children = node.children ?? [];
    }
  }
  return roots;
}
