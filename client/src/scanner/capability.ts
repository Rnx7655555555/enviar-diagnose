const MiB = 1024 * 1024;
const GiB = 1024 * MiB;

export type DeviceCapabilityLevel = "low" | "medium" | "high";

export type RuntimeHints = {
  deviceMemory?: number;
  hardwareConcurrency?: number;
  mobile?: boolean;
};

export type ScanPlan = {
  level: DeviceCapabilityLevel;
  chunkBytes: number;
  maxRelevantFileBytes: number;
  maxExpandedBytes: number;
  maxEntries: number;
  memoryHintGb?: number;
  coresHint?: number;
  fallback: boolean;
};

function browserHints(): RuntimeHints {
  if (typeof navigator === "undefined") return {};
  const navigatorWithMemory = navigator as Navigator & { deviceMemory?: number };
  return {
    deviceMemory: navigatorWithMemory.deviceMemory,
    hardwareConcurrency: navigator.hardwareConcurrency,
    mobile: /iPhone|iPad|iPod|Android/i.test(navigator.userAgent),
  };
}

export function createScanPlan(fileSize: number, provided?: RuntimeHints): ScanPlan {
  const hints = { ...browserHints(), ...provided };
  const memory = hints.deviceMemory;
  const cores = hints.hardwareConcurrency;
  const level: DeviceCapabilityLevel = memory && memory >= 8 && (cores ?? 0) >= 8 && !hints.mobile
    ? "high"
    : memory && memory >= 4 && (cores ?? 0) >= 4
      ? "medium"
      : !hints.mobile && (cores ?? 0) >= 8
        ? "high"
        : !hints.mobile && (cores ?? 0) >= 4
          ? "medium"
          : "low";

  const byLevel = {
    low: { chunkBytes: 256 * 1024, maxRelevantFileBytes: 4 * MiB, maxExpandedBytes: 8 * GiB, maxEntries: 20_000 },
    medium: { chunkBytes: 512 * 1024, maxRelevantFileBytes: 8 * MiB, maxExpandedBytes: 16 * GiB, maxEntries: 40_000 },
    high: { chunkBytes: 1024 * 1024, maxRelevantFileBytes: 16 * MiB, maxExpandedBytes: 32 * GiB, maxEntries: 60_000 },
  }[level];

  // A proteção limita a expansão estrutural e não o tamanho do arquivo escolhido.
  // Arquivos grandes seguem aceitos; o teto só interrompe arquivos com expansão insegura.
  const expansionFloor = 512 * MiB;
  const inputScaledBudget = Math.max(expansionFloor, fileSize * 128);
  return {
    level,
    ...byLevel,
    maxExpandedBytes: Math.min(byLevel.maxExpandedBytes, inputScaledBudget),
    memoryHintGb: memory,
    coresHint: cores,
    fallback: memory === undefined,
  };
}

export function capabilityLabel(level: DeviceCapabilityLevel) {
  return level === "high" ? "ALTA" : level === "medium" ? "MÉDIA" : "CONTROLADA";
}
