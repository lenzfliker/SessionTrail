import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { join, normalize } from "node:path";
import { logError, logInfo } from "./logger";

let rendererServer: ReturnType<typeof createServer> | null = null;
let rendererBaseUrl: string | null = null;

function getRendererRoot(): string {
  return join(__dirname, "..", "renderer");
}

function getContentType(filePath: string): string {
  if (filePath.endsWith(".html")) {
    return "text/html; charset=utf-8";
  }

  if (filePath.endsWith(".js")) {
    return "text/javascript; charset=utf-8";
  }

  if (filePath.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }

  if (filePath.endsWith(".json")) {
    return "application/json; charset=utf-8";
  }

  if (filePath.endsWith(".svg")) {
    return "image/svg+xml";
  }

  if (filePath.endsWith(".png")) {
    return "image/png";
  }

  if (filePath.endsWith(".wav")) {
    return "audio/wav";
  }

  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) {
    return "image/jpeg";
  }

  if (filePath.endsWith(".webp")) {
    return "image/webp";
  }

  if (filePath.endsWith(".bmp")) {
    return "image/bmp";
  }

  if (filePath.endsWith(".gif")) {
    return "image/gif";
  }

  if (filePath.endsWith(".mp4")) {
    return "video/mp4";
  }

  if (filePath.endsWith(".webm")) {
    return "video/webm";
  }

  if (filePath.endsWith(".mov")) {
    return "video/quicktime";
  }

  if (filePath.endsWith(".mkv")) {
    return "video/x-matroska";
  }

  return "application/octet-stream";
}

function resolveRequestPath(request: IncomingMessage): string {
  const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
  if (requestUrl.pathname === "/__sessiontrail_asset") {
    return normalize(requestUrl.searchParams.get("path") ?? "");
  }

  const pathname = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
  return normalize(join(getRendererRoot(), pathname));
}

function handleRequest(request: IncomingMessage, response: ServerResponse): void {
  try {
    const filePath = resolveRequestPath(request);
    logInfo("Serving renderer asset.", { url: request.url, filePath });
    const fileContent = readFileSync(filePath);
    response.statusCode = 200;
    response.setHeader("content-type", getContentType(filePath));
    response.end(fileContent);
  } catch (error) {
    logError("Failed to serve renderer asset.", {
      url: request.url,
      error
    });
    response.statusCode = 404;
    response.end("Not found");
  }
}

export async function startRendererServer(): Promise<string> {
  if (rendererBaseUrl) {
    return rendererBaseUrl;
  }

  rendererServer = createServer(handleRequest);

  await new Promise<void>((resolve, reject) => {
    rendererServer?.once("error", reject);
    rendererServer?.listen(0, "127.0.0.1", () => resolve());
  });

  const address = rendererServer.address();
  if (!address || typeof address === "string") {
    throw new Error("Renderer server did not expose a usable address.");
  }

  rendererBaseUrl = `http://127.0.0.1:${address.port}`;
  logInfo("Started packaged renderer server.", { url: rendererBaseUrl });
  return rendererBaseUrl;
}

export function stopRendererServer(): void {
  rendererServer?.close();
  rendererServer = null;
  rendererBaseUrl = null;
}
