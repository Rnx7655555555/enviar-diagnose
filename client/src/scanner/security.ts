export const scanLimits = {
  maxUploadBytes: 350 * 1024 * 1024,
  maxEntries: 15_000,
  maxExpandedBytes: 1_200 * 1024 * 1024,
  maxRelevantFileBytes: 6 * 1024 * 1024,
  workerChunkBytes: 512 * 1024,
  maxTreeNodes: 2_000,
} as const;

export type ArchiveFormat = "tar.gz" | "zip";

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
  const header = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  const isGzip = header[0] === 0x1f && header[1] === 0x8b;
  const isZip = header[0] === 0x50 && header[1] === 0x4b && [0x03, 0x05, 0x07].includes(header[2] ?? -1);
  if (isGzip) return "tar.gz";
  if (isZip) return "zip";
  throw new Error("O conteúdo não corresponde a um arquivo GZIP ou ZIP válido.");
}

export function assertFileAccepted(file: File) {
  const name = file.name.toLowerCase();
  if (!name.endsWith(".tar.gz") && !name.endsWith(".tgz") && !name.endsWith(".zip")) throw new Error("Use um arquivo .tar.gz, .tgz ou .zip.");
  if (file.size <= 0 || file.size > scanLimits.maxUploadBytes) throw new Error("O arquivo precisa ter entre 1 byte e 350 MB.");
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
