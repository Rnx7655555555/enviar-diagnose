import type { SignatureDefinition, WorkerEvent } from "./types";

export function startLocalScan(file: File, signatures: SignatureDefinition[], onEvent: (event: WorkerEvent) => void) {
  const worker = new Worker(new URL("./worker/scanner.worker.ts", import.meta.url), { type: "module" });
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    worker.onmessage = null;
    worker.onerror = null;
    worker.terminate();
  };
  worker.onmessage = (message: MessageEvent<WorkerEvent>) => { onEvent(message.data); if (message.data.type === "complete" || message.data.type === "error" || message.data.type === "cancelled") release(); };
  worker.onerror = () => { onEvent({ type: "error", message: "O navegador não conseguiu iniciar o processamento local." }); release(); };
  worker.postMessage({ type: "scan", file, signatures });
  return () => { if (!released) { worker.postMessage({ type: "cancel" }); release(); } };
}
