import type { SignatureDefinition, WorkerEvent } from "./types";

export function startLocalScan(file: File, signatures: SignatureDefinition[], onEvent: (event: WorkerEvent) => void) {
  const worker = new Worker(new URL("./worker/scanner.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (message: MessageEvent<WorkerEvent>) => { onEvent(message.data); if (message.data.type === "complete" || message.data.type === "error" || message.data.type === "cancelled") worker.terminate(); };
  worker.onerror = () => { onEvent({ type: "error", message: "O navegador não conseguiu iniciar o processamento local." }); worker.terminate(); };
  worker.postMessage({ type: "scan", file, signatures });
  return () => { worker.postMessage({ type: "cancel" }); worker.terminate(); };
}
