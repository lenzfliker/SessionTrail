import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";

export type LogLevel = "INFO" | "WARN" | "ERROR";

function nowIso(): string {
  return new Date().toISOString();
}

function getLogFilePath(): string {
  const logDir = join(app.getPath("userData"), "logs");
  mkdirSync(logDir, { recursive: true });
  return join(logDir, "sessiontrail.log");
}

function toMessage(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}\n${error.stack ?? ""}`.trim();
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function log(level: LogLevel, message: string, details?: unknown): void {
  const suffix = details === undefined ? "" : `\n${toMessage(details)}`;
  const line = `[${nowIso()}] [${level}] ${message}${suffix}\n`;

  try {
    appendFileSync(getLogFilePath(), line, "utf8");
  } catch {
    console.error(line);
  }

  if (level === "ERROR") {
    details === undefined ? console.error(message) : console.error(message, details);
  } else if (level === "WARN") {
    details === undefined ? console.warn(message) : console.warn(message, details);
  } else {
    details === undefined ? console.log(message) : console.log(message, details);
  }
}

export function logInfo(message: string, details?: unknown): void {
  log("INFO", message, details);
}

export function logWarn(message: string, details?: unknown): void {
  log("WARN", message, details);
}

export function logError(message: string, details?: unknown): void {
  log("ERROR", message, details);
}
