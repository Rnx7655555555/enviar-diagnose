export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)) - 1, units.length - 1);
  return `${(bytes / 1024 ** (index + 1)).toFixed(index ? 1 : 0)} ${units[index]}`;
}

export function formatDuration(ms: number | null) {
  if (!ms) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function localDate(value: Date | string | null) {
  return value ? new Date(value).toLocaleString("pt-BR", { dateStyle: "medium", timeStyle: "short" }) : "—";
}
