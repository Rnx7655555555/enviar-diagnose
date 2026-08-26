import { Button } from "@/components/ui/button";
import { formatBytes, formatDuration } from "@/lib/format";
import { AlertTriangle, CheckCircle2, ChevronDown, CircleCheck, FileArchive, FileUp, Loader2, RotateCcw, ShieldCheck, UploadCloud } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

type PublicEvidence = { category: string; signature: string; indicator: string; confidence: string; sourcePath: string; plistPath: string | null; plistKey: string | null; context: string; reason: string };
type PublicReport = { fileName: string; fileSize: number; fileFormat: string; durationMs: number; result: "clean" | "suspicious" | "evidence"; score: number; processedFileCount: number; relevantFileCount: number; evidence: PublicEvidence[]; recommendations: string[] };
type Phase = "upload" | "validation" | "extraction" | "analysis" | "report" | "complete";
type ProgressState = { phase: Phase; progress: number; stage: string; uploadPercent: number; uploadLoaded: number; uploadTotal: number; processed: number; relevant: number; startedAt: number };

const supported = [".tar.gz", ".tgz", ".zip"];
const maxBytes = 350 * 1024 * 1024;
const steps: Array<{ phase: Phase; number: string; label: string; detail: string }> = [
  { phase: "upload", number: "01", label: "Enviar arquivo", detail: "Transferência do Sysdiagnose" },
  { phase: "validation", number: "02", label: "Validar conteúdo", detail: "Formato, tamanho e integridade" },
  { phase: "extraction", number: "03", label: "Extrair com segurança", detail: "Leitura limitada do arquivo compactado" },
  { phase: "analysis", number: "04", label: "Analisar evidências", detail: "Logs, plists, XML e regras contextuais" },
  { phase: "report", number: "05", label: "Preparar relatório", detail: "Correlação e classificação dos achados" },
];
const phaseRank: Record<Phase, number> = { upload: 0, validation: 1, extraction: 2, analysis: 3, report: 4, complete: 5 };

function phaseFrom(stage: string, progress: number): Phase {
  const value = stage.toLowerCase();
  if (progress >= 90 || value.includes("correlacion")) return "report";
  if (value.includes("analisando")) return "analysis";
  if (value.includes("extra") || value.includes("localizando")) return "extraction";
  return "validation";
}

function formatEta(progress: ProgressState) {
  const elapsed = Date.now() - progress.startedAt;
  if (progress.progress < 8 || progress.progress >= 99) return "Calculando estimativa";
  const remaining = Math.max(0, Math.round((elapsed / progress.progress) * (100 - progress.progress)));
  if (remaining < 1_000) return "Quase concluído";
  if (remaining < 60_000) return `Cerca de ${Math.ceil(remaining / 1_000)} s restantes`;
  return `Cerca de ${Math.ceil(remaining / 60_000)} min restantes`;
}

function ResultBadge({ result }: { result: PublicReport["result"] }) {
  const labels = { clean: "Nenhuma evidência conclusiva", suspicious: "Revisão recomendada", evidence: "Evidências com contexto" };
  const styles = { clean: "border-emerald-300/30 bg-emerald-300/10 text-emerald-100", suspicious: "border-amber-300/30 bg-amber-300/10 text-amber-100", evidence: "border-orange-300/30 bg-orange-300/10 text-orange-100" };
  return <span className={`inline-flex rounded-full border px-3 py-1.5 text-xs font-semibold ${styles[result]}`}>{labels[result]}</span>;
}

function ProgressPanel({ value }: { value: ProgressState }) {
  const elapsed = Date.now() - value.startedAt;
  return <section className="mt-8 overflow-hidden rounded-2xl border border-cyan-300/15 bg-[#0e1622] shadow-[0_20px_60px_rgba(0,0,0,.24)]"><div className="border-b border-white/[.07] px-5 py-5 sm:px-7"><div className="flex items-start justify-between gap-5"><div><p className="eyebrow">PROCESSAMENTO EM ANDAMENTO</p><h2 className="mt-2 text-xl font-semibold text-slate-100">{value.stage}</h2><p className="mt-1 text-xs text-slate-500">Os dados abaixo são atualizados por eventos reais do upload e do motor de análise.</p></div><div className="text-right"><p className="font-mono text-2xl font-semibold text-cyan-200">{value.progress}%</p><p className="mt-1 text-[10px] uppercase tracking-[.12em] text-slate-500">concluído</p></div></div><div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-sky-400 transition-[width] duration-300" style={{ width: `${Math.max(1, value.progress)}%` }} /></div><div className="mt-4 flex flex-wrap justify-between gap-3 text-xs"><span className="text-cyan-100"><Loader2 className="mr-1.5 inline h-3.5 w-3.5 animate-spin" />{formatEta(value)}</span><span className="font-mono text-slate-500">decorrido {formatDuration(elapsed)}</span></div></div><ol className="divide-y divide-white/[.06]">{steps.map(step => { const current = value.phase === step.phase; const done = phaseRank[value.phase] > phaseRank[step.phase] || value.phase === "complete"; return <li key={step.phase} className={`flex gap-4 px-5 py-4 sm:px-7 ${current ? "bg-cyan-300/[.035]" : ""}`}><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border font-mono text-[11px] ${done ? "border-cyan-300/25 bg-cyan-300/10 text-cyan-100" : current ? "border-cyan-300/50 text-cyan-100" : "border-slate-700 text-slate-600"}`}>{done ? <CircleCheck className="h-4 w-4" /> : step.number}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className={`text-sm font-medium ${current || done ? "text-slate-100" : "text-slate-500"}`}>{step.label}</p>{step.phase === "upload" && value.uploadTotal > 0 ? <span className="font-mono text-[11px] text-slate-500">{value.uploadPercent}% · {formatBytes(value.uploadLoaded)} / {formatBytes(value.uploadTotal)}</span> : null}{step.phase === "analysis" && value.processed > 0 ? <span className="font-mono text-[11px] text-slate-500">{value.processed} processados · {value.relevant} relevantes</span> : null}</div><p className="mt-1 text-xs leading-5 text-slate-500">{current ? value.stage : step.detail}</p></div></li>; })}</ol><div className="grid grid-cols-2 gap-px border-t border-white/[.07] bg-white/[.07]"><div className="bg-[#0e1622] px-5 py-4 sm:px-7"><p className="text-[10px] font-semibold uppercase tracking-[.12em] text-slate-500">Arquivos processados</p><p className="mt-1 text-lg font-semibold text-slate-100">{value.processed}</p></div><div className="bg-[#0e1622] px-5 py-4 sm:px-7"><p className="text-[10px] font-semibold uppercase tracking-[.12em] text-slate-500">Arquivos relevantes</p><p className="mt-1 text-lg font-semibold text-slate-100">{value.relevant}</p></div></div></section>;
}

export default function PublicDiagnose() {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [report, setReport] = useState<PublicReport | null>(null);
  const [progress, setProgress] = useState<ProgressState | null>(null);

  const selectFile = (candidate?: File) => { if (!candidate) return; const name = candidate.name.toLowerCase(); if (!supported.some(extension => name.endsWith(extension))) return toast.error("Use .tar.gz, .tgz ou .zip."); if (candidate.size <= 0 || candidate.size > maxBytes) return toast.error("O arquivo precisa ter entre 1 byte e 350 MB."); setReport(null); setProgress(null); setFile(candidate); };
  const reset = () => { setFile(null); setReport(null); setProgress(null); setProcessing(false); if (input.current) input.current.value = ""; };

  const submit = () => {
    if (!file) return;
    const startedAt = Date.now();
    setProcessing(true);
    setProgress({ phase: "upload", progress: 0, stage: "Iniciando envio seguro", uploadPercent: 0, uploadLoaded: 0, uploadTotal: file.size, processed: 0, relevant: 0, startedAt });
    const request = new XMLHttpRequest();
    const apiBase = (import.meta.env.VITE_SCANNER_API_URL ?? "").replace(/\/$/, "");
    let cursor = 0;
    let pending = "";
    const fail = (message: string) => { setProcessing(false); toast.error(message); };
    const consumeEvents = () => {
      pending += request.responseText.slice(cursor);
      cursor = request.responseText.length;
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      lines.forEach(line => {
        if (!line.trim()) return;
        try {
          const event = JSON.parse(line) as { type: string; progress?: number; stage?: string; processedFileCount?: number; relevantFileCount?: number; report?: PublicReport; message?: string };
          if (event.type === "progress") setProgress(current => current ? { ...current, phase: phaseFrom(event.stage ?? current.stage, event.progress ?? current.progress), progress: event.progress ?? current.progress, stage: event.stage ?? current.stage, processed: event.processedFileCount ?? current.processed, relevant: event.relevantFileCount ?? current.relevant, uploadPercent: 100, uploadLoaded: current.uploadTotal } : current);
          if (event.type === "complete" && event.report) { setProgress(current => current ? { ...current, phase: "complete", progress: 100, stage: "Relatório finalizado" } : current); setReport(event.report); setProcessing(false); }
          if (event.type === "error") fail(event.message ?? "Não foi possível analisar o arquivo.");
        } catch { /* Wait for the next newline if the streamed JSON arrived fragmented. */ }
      });
    };
    request.open("POST", `${apiBase}/api/public-scan`);
    request.setRequestHeader("Accept", "application/x-ndjson");
    request.upload.onprogress = event => { if (!event.lengthComputable) return; const uploadPercent = Math.round((event.loaded / event.total) * 100); setProgress(current => current ? { ...current, phase: "upload", progress: Math.min(12, Math.round(uploadPercent * 0.12)), stage: `Enviando arquivo com segurança (${uploadPercent}%)`, uploadPercent, uploadLoaded: event.loaded, uploadTotal: event.total } : current); };
    request.onprogress = consumeEvents;
    request.onload = () => { consumeEvents(); if (request.status < 200 || request.status >= 300) { try { const payload = JSON.parse(request.responseText) as { error?: string }; fail(payload.error ?? "O servidor recusou o arquivo enviado."); } catch { fail("O servidor recusou o arquivo enviado."); } return; } if (!request.responseText.includes('"type":"complete"')) { try { const payload = JSON.parse(request.responseText) as PublicReport & { error?: string }; if (payload.error) return fail(payload.error); if (payload.fileName) { setReport(payload); setProcessing(false); } } catch { fail("O servidor retornou uma resposta de análise inválida."); } } };
    request.onerror = () => fail("Não foi possível conectar ao backend de análise. Tente novamente.");
    const body = new FormData(); body.append("file", file); request.send(body);
  };

  return <main className="min-h-screen bg-[#080d14] px-4 py-8 text-slate-100 sm:px-6 sm:py-12"><div className="mx-auto max-w-3xl"><header className="flex items-center justify-between border-b border-white/[0.08] pb-5"><div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-300/10"><ShieldCheck className="h-5 w-5 text-cyan-200" /></div><div><p className="text-sm font-semibold tracking-[.16em] text-slate-100">ENVIAR DIAGNOSE</p><p className="mt-0.5 text-[10px] tracking-[.1em] text-slate-500">iOS SYS DIAGNOSE SCANNER</p></div></div><span className="hidden text-xs text-slate-500 sm:block">Análise local temporária</span></header>{!report ? <section className="py-12 sm:py-16"><p className="eyebrow">SYS DIAGNOSE · IPHONE / iOS</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl">Enviar Diagnose</h1><p className="mt-4 max-w-xl text-sm leading-6 text-slate-400">Envie um Sysdiagnose compactado para análise contextual. O arquivo é validado, processado temporariamente e removido ao final.</p>{processing && progress ? <ProgressPanel value={progress} /> : <><input ref={input} type="file" accept=".tar.gz,.tgz,.zip" className="hidden" onChange={event => selectFile(event.target.files?.[0])} /><button onClick={() => input.current?.click()} onDragEnter={event => { event.preventDefault(); setDragging(true); }} onDragOver={event => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); selectFile(event.dataTransfer.files?.[0]); }} className={`mt-8 flex min-h-64 w-full flex-col items-center justify-center rounded-2xl border border-dashed px-6 text-center transition-colors ${dragging ? "border-cyan-300/70 bg-cyan-300/[.06]" : "border-slate-600/80 bg-[#0e1622] hover:border-cyan-300/40"}`}><div className="grid h-14 w-14 place-items-center rounded-2xl bg-cyan-300/[.08] text-cyan-200"><UploadCloud className="h-6 w-6" /></div><p className="mt-5 text-base font-medium text-slate-100">Selecionar arquivo Sysdiagnose</p><p className="mt-2 text-xs leading-5 text-slate-500">Formatos aceitos: .tar.gz, .tgz ou .zip · máximo de 350 MB</p></button>{file && <div className="mt-4 flex flex-col gap-4 rounded-xl border border-cyan-300/15 bg-cyan-300/[.04] p-4 sm:flex-row sm:items-center"><FileArchive className="h-5 w-5 shrink-0 text-cyan-200" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-slate-200">{file.name}</p><p className="mt-1 text-xs text-slate-500">{formatBytes(file.size)} · pronto para validar</p></div><button className="text-xs text-slate-400 hover:text-slate-100" onClick={reset}>Remover</button></div>}<div className="mt-6 flex flex-col items-start justify-between gap-4 border-t border-white/[.07] pt-5 sm:flex-row sm:items-center"><p className="max-w-md text-xs leading-5 text-slate-500">Sequências isoladas e curtas não produzem confirmação. O resultado é uma triagem técnica, não um diagnóstico definitivo.</p><Button disabled={!file} onClick={submit} className="w-full bg-cyan-300 text-slate-950 hover:bg-cyan-200 sm:w-auto"><FileUp className="mr-2 h-4 w-4" />Iniciar análise</Button></div></>}</section> : <section className="py-10"><div className="flex flex-col gap-5 border-b border-white/[.08] pb-7 sm:flex-row sm:items-start sm:justify-between"><div><p className="eyebrow">RELATÓRIO DE VARREDURA</p><h1 className="mt-3 break-all text-2xl font-semibold tracking-tight text-slate-50">{report.fileName}</h1><p className="mt-2 text-sm text-slate-500">{formatBytes(report.fileSize)} · {formatDuration(report.durationMs)} · {report.processedFileCount} arquivo(s) processado(s)</p></div><ResultBadge result={report.result} /></div><div className="mt-6 grid gap-3 sm:grid-cols-3">{[["Score de confiança", `${report.score}/100`],["Evidências", String(report.evidence.length)],["Arquivos relevantes", String(report.relevantFileCount)]].map(([label, value]) => <div key={label} className="rounded-xl border border-white/[.08] bg-[#0e1622] p-4"><p className="text-[10px] font-semibold uppercase tracking-[.12em] text-slate-500">{label}</p><p className="mt-3 text-xl font-semibold text-slate-100">{value}</p></div>)}</div><div className="mt-7"><p className="eyebrow">EVIDÊNCIAS</p>{report.evidence.length ? <div className="mt-3 space-y-3">{report.evidence.map((item, index) => <details key={`${item.signature}-${index}`} className="group rounded-xl border border-white/[.08] bg-[#0e1622] px-4"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4"><div className="min-w-0"><p className="text-sm font-medium text-slate-100">{item.signature}</p><p className="mt-1 truncate text-xs text-slate-500">{item.sourcePath}</p></div><ChevronDown className="h-4 w-4 shrink-0 text-slate-500 transition-transform group-open:rotate-180" /></summary><div className="border-t border-white/[.07] py-4 text-xs leading-5 text-slate-400"><p><b className="text-slate-200">Indicador:</b> {item.indicator}</p><p className="mt-2"><b className="text-slate-200">Por que apareceu:</b> {item.reason}</p><p className="mt-2"><b className="text-slate-200">Localização:</b> {item.plistPath ?? item.sourcePath}{item.plistKey ? ` → ${item.plistKey}` : ""}</p><pre className="mt-3 max-h-32 overflow-auto rounded-lg border border-white/[.06] bg-black/20 p-3 whitespace-pre-wrap break-words text-[11px] text-slate-500">{item.context || "Contexto textual não disponível."}</pre></div></details>)}</div> : <div className="mt-3 rounded-xl border border-dashed border-slate-700 p-7 text-center"><CheckCircle2 className="mx-auto h-5 w-5 text-emerald-200" /><p className="mt-3 text-sm text-slate-200">Nenhuma evidência contextual encontrada</p><p className="mt-1 text-xs leading-5 text-slate-500">Isto não substitui uma revisão independente do arquivo original.</p></div>}</div><div className="mt-7 rounded-xl border border-amber-300/15 bg-amber-300/[.04] p-5"><AlertTriangle className="h-4 w-4 text-amber-100" /><p className="mt-3 text-sm font-medium text-amber-100">Investigação segura</p><ul className="mt-2 space-y-2 text-xs leading-5 text-amber-100/65">{report.recommendations.map(item => <li key={item}>{item}</li>)}</ul></div><Button onClick={reset} variant="outline" className="mt-7 border-slate-700 bg-transparent text-slate-200 hover:bg-white/[.05]"><RotateCcw className="mr-2 h-4 w-4" />Enviar outro Diagnose</Button></section>}<footer className="border-t border-white/[.07] pt-5 text-center text-[11px] text-slate-600">Enviar Diagnose · análise contextual de SYSdiagnose</footer></div></main>;
}
