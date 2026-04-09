import { desktopCapturer, screen } from "electron";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import { logInfo } from "./logger";

export type CapturedScreenshot = {
  filePath: string;
  width: number;
  height: number;
  pngBuffer: Buffer;
};

export class CaptureService {
  public async capturePrimaryDisplayPng(sessionId: string, checkpointId: string): Promise<CapturedScreenshot> {
    const primaryDisplay = screen.getPrimaryDisplay();
    const width = Math.max(1, Math.floor(primaryDisplay.size.width * primaryDisplay.scaleFactor));
    const height = Math.max(1, Math.floor(primaryDisplay.size.height * primaryDisplay.scaleFactor));

    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: {
        width,
        height
      },
      fetchWindowIcons: false
    });

    const matchedSource =
      sources.find((source) => source.display_id === String(primaryDisplay.id)) ?? sources[0];

    if (!matchedSource || matchedSource.thumbnail.isEmpty()) {
      throw new Error("Unable to capture the primary display screenshot.");
    }

    const filePath = this.buildScreenshotPath(sessionId, checkpointId);
    const pngBuffer = matchedSource.thumbnail.toPNG();

    mkdirSync(join(app.getPath("userData"), "assets", "screenshots", sessionId), {
      recursive: true
    });
    writeFileSync(filePath, pngBuffer);
    logInfo("Captured primary display screenshot.", { sessionId, checkpointId, filePath });

    return {
      filePath,
      width: matchedSource.thumbnail.getSize().width,
      height: matchedSource.thumbnail.getSize().height,
      pngBuffer
    };
  }

  private buildScreenshotPath(sessionId: string, checkpointId: string): string {
    return join(app.getPath("userData"), "assets", "screenshots", sessionId, `${checkpointId}.png`);
  }
}
