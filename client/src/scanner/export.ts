import { jsPDF } from "jspdf";
import type { ScanReport } from "./types";

function download(content: BlobPart, type: string, name: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function resultLabel(report: ScanReport) {
  return report.result === "yes" ? "SIM" : report.result === "manual" ? "VERIFICAR MANUALMENTE" : "NÃO";
}

function reportLines(report: ScanReport) {
  return [
    "RX7 — iOS Sysdiagnose Scanner",
    `Arquivo: ${report.fileName}`,
    `Resultado: ${resultLabel(report)}`,
    "",
    "CORRESPONDÊNCIAS VÁLIDAS",
    ...(report.evidence.length ? report.evidence.flatMap(item => [
      `Categoria: ${item.category}`,
      `Regra: ${item.signature}`,
      `Identificador/valor completo: ${item.value}`,
      `Arquivo: ${item.sourcePath}`,
      `Local: ${item.plistPath ?? "—"}`,
      `Chave: ${item.plistKey ?? "—"}`,
      `Correspondência: ${item.match}`,
      `Motivo: ${item.reason}`,
      "",
    ]) : ["Nenhuma correspondência exata encontrada.", ""]),
    "VERIFICAR MANUALMENTE",
    ...(report.manualReviews.length ? report.manualReviews.flatMap(item => [
      `Identificador: ${item.identifier}`,
      `Arquivo: ${item.sourcePath}`,
      `Local: ${item.plistPath ?? "—"}`,
      `Motivo: ${item.reason}`,
      "",
    ]) : ["Nenhum identificador estruturado pendente de revisão.", ""]),
    "LIMITAÇÕES",
    ...(report.limitations.length ? report.limitations : ["Nenhuma limitação reportada." ]),
    "",
    "O resultado é uma triagem técnica baseada em correspondências exatas e não substitui análise forense ou diagnóstico definitivo.",
  ];
}

export function exportJson(report: ScanReport) {
  download(JSON.stringify(report, null, 2), "application/json", `${report.fileName}-rx7-report.json`);
}

export function exportTxt(report: ScanReport) {
  download(reportLines(report).join("\n"), "text/plain;charset=utf-8", `${report.fileName}-rx7-report.txt`);
}

export function exportPdf(report: ScanReport) {
  const pdf = new jsPDF();
  let y = 16;
  pdf.setFontSize(14);
  reportLines(report).forEach(line => {
    const wrapped = pdf.splitTextToSize(line, 180);
    if (y + wrapped.length * 6 > 280) { pdf.addPage(); y = 16; }
    pdf.text(wrapped, 15, y);
    y += wrapped.length * 6 + 2;
  });
  pdf.save(`${report.fileName}-rx7-report.pdf`);
}
