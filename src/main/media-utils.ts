import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";

function getFfmpegPath(): string {
  if (!ffmpegStatic) {
    throw new Error("FFmpeg binary is unavailable.");
  }

  return ffmpegStatic;
}

function parseDurationMs(stderr: string): number | null {
  const match = stderr.match(/Duration:\s+(\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
  if (!match) {
    return null;
  }

  const [, hours, minutes, seconds, hundredths] = match;
  return (
    Number(hours) * 3_600_000 +
    Number(minutes) * 60_000 +
    Number(seconds) * 1_000 +
    Number(hundredths) * 10
  );
}

function parseAudioStreamInfo(stderr: string): {
  codec: string | null;
  sampleRateHz: number | null;
  channelLayout: string | null;
} | null {
  const audioLine = stderr
    .split(/\r?\n/)
    .find((line) => line.includes("Audio:"));
  if (!audioLine) {
    return null;
  }

  const codecMatch = audioLine.match(/Audio:\s*([^,\s]+)/i);
  const sampleRateMatch = audioLine.match(/(\d+)\s*Hz/i);
  const channelLayoutMatch =
    audioLine.match(/\b(stereo|mono|5\.1(?:\(side\))?|7\.1(?:\(wide\))?)\b/i) ??
    audioLine.match(/,\s*([^,]+)\s*,\s*(?:fltp|s16p|s16|s32p|s32|u8|dblp|dbl)\b/i);

  return {
    codec: codecMatch?.[1] ?? null,
    sampleRateHz: sampleRateMatch ? Number(sampleRateMatch[1]) : null,
    channelLayout: channelLayoutMatch?.[1] ?? null
  };
}

export async function probeMediaDurationMs(filePath: string): Promise<number | null> {
  const ffmpegPath = getFfmpegPath();

  return new Promise<number | null>((resolve, reject) => {
    const process = spawn(ffmpegPath, ["-i", filePath, "-f", "null", "-"], {
      windowsHide: true
    });

    let stderr = "";

    process.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    process.on("error", (error) => {
      reject(error);
    });

    process.on("close", () => {
      resolve(parseDurationMs(stderr));
    });
  });
}

export async function probeAudioStreamInfo(filePath: string): Promise<{
  codec: string | null;
  sampleRateHz: number | null;
  channelLayout: string | null;
} | null> {
  const ffmpegPath = getFfmpegPath();

  return new Promise((resolve, reject) => {
    const process = spawn(ffmpegPath, ["-i", filePath, "-f", "null", "-"], {
      windowsHide: true
    });

    let stderr = "";

    process.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    process.on("error", (error) => {
      reject(error);
    });

    process.on("close", () => {
      resolve(parseAudioStreamInfo(stderr));
    });
  });
}

export async function runFfmpeg(args: string[]): Promise<void> {
  return runFfmpegWithHandle(args).completion;
}

export function runFfmpegWithHandle(args: string[]): {
  process: ChildProcessWithoutNullStreams;
  completion: Promise<void>;
} {
  const ffmpegPath = getFfmpegPath();
  const process = spawn(ffmpegPath, args, {
    windowsHide: true
  });

  const completion = new Promise<void>((resolve, reject) => {
    let stderr = "";

    process.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    process.on("error", (error) => {
      reject(error);
    });

    process.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr.trim() || `FFmpeg failed with exit code ${code ?? "unknown"}.`));
    });
  });

  return { process, completion };
}
