import { basename } from "node:path";
import { inspectTarGz, inspectZip } from "./archive";
import { correlateEvidence, detectInContent } from "./detector";
import { parsePlistValues } from "../parser/plistParser";
import { parseStructuredValues } from "../parser/structuredParser";
import type { ScanOutcome } from "./types";
import type { SignatureDefinition } from "../signatures/types";

export type EngineProgress = (progress: number, stage: string, processed: number, relevant: number) => Promise<void>;

export async function analyzeSysdiagnose(
  filePath: string,
  format: "tar.gz" | "zip",
  signatures: SignatureDefinition[],
  onProgress: EngineProgress,
  signal?: AbortSignal
): Promise<ScanOutcome> {
  let processedFileCount = 0;
  let relevantFileCount = 0;
  const evidence = [] as ReturnType<typeof detectInContent>;
  await onProgress(25, "Localizando arquivos relevantes", processedFileCount, relevantFileCount);

  const onEntry = async ({ sourcePath, text }: { sourcePath: string; text: string }) => {
    processedFileCount += 1;
    relevantFileCount += 1;
    const plistValues = parsePlistValues(text);
    const structuredValues = plistValues.length ? plistValues : parseStructuredValues(sourcePath, text);
    evidence.push(...detectInContent(sourcePath, text, structuredValues, signatures));
    const stage = structuredValues.length ? "Analisando plist, XML e preferências" : "Analisando logs relevantes";
    await onProgress(Math.min(88, 28 + Math.round(Math.log2(processedFileCount + 1) * 12)), stage, processedFileCount, relevantFileCount);
  };

  if (format === "tar.gz") await inspectTarGz(filePath, onEntry, signal);
  else await inspectZip(filePath, onEntry, signal);

  await onProgress(90, "Correlacionando evidências", processedFileCount, relevantFileCount);
  const correlated = correlateEvidence(evidence);
  const aggregateScore = Math.min(100, correlated.reduce((sum, item) => sum + item.score, 0));
  const hasHighConfidence = correlated.some(item => (item.confidence === "alta" || item.confidence === "confirmada") && item.contextQuality === "verified");
  const hasMediumConfidence = correlated.some(item => item.confidence === "media");

  return {
    evidence: correlated,
    processedFileCount,
    relevantFileCount,
    aggregateScore,
    result: hasHighConfidence ? "evidence" : hasMediumConfidence ? "suspicious" : "clean",
  };
}

export function reportRecommendations(outcome: ScanOutcome) {
  if (!outcome.evidence.length) return ["Nenhum indicador da base ativa foi encontrado nos arquivos relevantes processados. Preserve o arquivo original para revisão independente, se necessário."];
  const recommendations = ["Revise os trechos e caminhos exibidos no relatório antes de tirar qualquer conclusão."];
  if (outcome.evidence.some(item => item.signature.category.toLocaleLowerCase().includes("certificado"))) recommendations.push("Compare certificados e perfis encontrados com a política MDM ou inventário confiável do aparelho.");
  if (outcome.evidence.some(item => /proxy|network/i.test(`${item.signature.category} ${item.sourcePath}`))) recommendations.push("Valide configurações de rede e proxy no contexto do ambiente autorizado do dispositivo.");
  recommendations.push("O resultado é uma triagem técnica baseada em regras; não substitui investigação forense ou diagnóstico definitivo.");
  return recommendations;
}
