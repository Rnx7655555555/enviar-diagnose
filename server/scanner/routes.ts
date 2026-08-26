import type { Express, Request, Response } from "express";
import { mkdir, rm, stat } from "node:fs/promises";
import { basename } from "node:path";
import { randomUUID } from "node:crypto";
import multer from "multer";
import { defaultSignatures } from "../signatures/defaultSignatures";
import { archiveFormat, assertArchiveHeader, scanLimits } from "./archive";
import { analyzeSysdiagnose, reportRecommendations } from "./engine";

const uploadRoot = "/tmp/enviar-diagnose";

const upload = multer({
  storage: multer.diskStorage({
    destination: async (_req, _file, callback) => {
      try { await mkdir(uploadRoot, { recursive: true }); callback(null, uploadRoot); }
      catch (error) { callback(error as Error, uploadRoot); }
    },
    filename: (_req, file, callback) => callback(null, `${randomUUID()}-${basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, "_")}`),
  }),
  limits: { fileSize: scanLimits.maxUploadBytes, files: 1, fields: 0 },
  fileFilter: (_req, file, callback) => callback(null, Boolean(archiveFormat(file.originalname))),
});

function fail(res: Response, status: number, message: string) { return res.status(status).json({ error: message }); }

/** Public, stateless scanner: every uploaded archive is removed when the request ends. */
export function registerScannerRoutes(app: Express) {
  app.post("/api/public-scan", (req, res, next) => upload.single("file")(req, res, error => error ? next(error) : next()), async (req: Request, res: Response) => {
    if (!req.file) return fail(res, 400, "Envie um arquivo .tar.gz, .tgz ou .zip compatível.");
    const format = archiveFormat(req.file.originalname);
    if (!format) { await rm(req.file.path, { force: true }); return fail(res, 415, "Formato não suportado."); }
    try {
      const fileInfo = await stat(req.file.path);
      if (fileInfo.size <= 0 || fileInfo.size > scanLimits.maxUploadBytes) throw new Error("O arquivo não atende aos limites de tamanho configurados.");
      await assertArchiveHeader(req.file.path, format);
      const startedAt = Date.now();
      const outcome = await analyzeSysdiagnose(req.file.path, format, defaultSignatures.filter(rule => rule.isActive !== false), async () => undefined);
      return res.json({
        fileName: req.file.originalname,
        fileSize: fileInfo.size,
        fileFormat: format,
        durationMs: Date.now() - startedAt,
        result: outcome.result,
        score: outcome.aggregateScore,
        processedFileCount: outcome.processedFileCount,
        relevantFileCount: outcome.relevantFileCount,
        evidence: outcome.evidence.map(item => ({ category: item.signature.category, signature: item.signature.name, indicator: item.signature.indicator, confidence: item.confidence, sourcePath: item.sourcePath, plistPath: item.plistPath, plistKey: item.plistKey, context: item.context, reason: item.reason })),
        recommendations: reportRecommendations(outcome),
      });
    } catch (error) {
      return fail(res, 422, error instanceof Error ? error.message : "Não foi possível analisar o arquivo enviado.");
    } finally {
      await rm(req.file.path, { force: true });
    }
  });
}
