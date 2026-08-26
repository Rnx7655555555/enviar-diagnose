import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { registerScannerRoutes } from "../scanner/routes";
import { serveStatic, setupVite } from "./vite";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => server.close(() => resolve(true)));
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort = 3000) {
  for (let port = startPort; port < startPort + 20; port += 1) if (await isPortAvailable(port)) return port;
  throw new Error("Nenhuma porta disponível para iniciar o servidor.");
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  registerScannerRoutes(app);
  if (process.env.NODE_ENV === "development") await setupVite(app, server);
  else serveStatic(app);
  const port = await findAvailablePort(Number(process.env.PORT ?? 3000));
  server.listen(port, () => console.log(`Server running on http://localhost:${port}/`));
}

startServer().catch(console.error);
