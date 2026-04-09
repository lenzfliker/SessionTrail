import { app } from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";

export function resolveAppAssetPath(fileName: string): string {
  const candidates = [
    join(app.getAppPath(), "public", "icons", fileName),
    join(app.getAppPath(), "dist", "renderer", "icons", fileName),
    join(process.cwd(), "public", "icons", fileName),
    join(process.cwd(), "dist", "renderer", "icons", fileName),
    join(__dirname, "..", "..", "public", "icons", fileName),
    join(__dirname, "..", "renderer", "icons", fileName)
  ];

  const resolved = candidates.find((candidate) => existsSync(candidate));
  return resolved ?? candidates[0];
}
