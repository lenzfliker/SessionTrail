import type {
  AudioAssetSummary,
  ExportCompositionSummary,
  ExportTimelineSegmentSummary,
  SaveExportCompositionInput,
  SessionSummary
} from "../shared/contracts";

export type RecordingMarker = { checkpointId: string; offsetMs: number };

export const MIN_SEGMENT_DURATION_MS = 500;

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const sortSegments = (segments: ExportTimelineSegmentSummary[]) =>
  [...segments].sort((a, b) => a.startOffsetMs - b.startOffsetMs || a.sortOrder - b.sortOrder);

export function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600).toString().padStart(2, "0");
  const minutes = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

export function formatDurationFromMs(durationMs: number): string {
  return formatDuration(Math.max(0, Math.round(durationMs / 1000)));
}

export function getWorkedSecondsForDisplay(session: SessionSummary | null, nowMs: number): number {
  if (!session || session.status !== "active" || !session.lastHeartbeatAt) {
    return session?.workedSeconds ?? 0;
  }

  return session.workedSeconds + Math.max(0, Math.floor((nowMs - Date.parse(session.lastHeartbeatAt)) / 1000));
}

export function getEffectiveVoiceOverDurationMs(asset: AudioAssetSummary | null): number | null {
  return asset?.durationMs ?? null;
}

export function buildSegmentsFromMarkers(
  durationMs: number,
  markers: RecordingMarker[]
): SaveExportCompositionInput["segments"] {
  const sorted = [...markers]
    .sort((a, b) => a.offsetMs - b.offsetMs)
    .filter((marker, index, list) => index === 0 || marker.offsetMs > list[index - 1].offsetMs);

  return sorted.map((marker, index) => ({
    checkpointId: marker.checkpointId,
    startOffsetMs: index === 0 ? 0 : marker.offsetMs,
    endOffsetMs:
      index === sorted.length - 1
        ? Math.max(durationMs, marker.offsetMs + MIN_SEGMENT_DURATION_MS)
        : Math.max(sorted[index + 1].offsetMs, marker.offsetMs + MIN_SEGMENT_DURATION_MS),
    sortOrder: index,
    source: "live_marker" as const
  }));
}

export function resizeBoundary(
  composition: ExportCompositionSummary,
  segmentId: string,
  edge: "start" | "end",
  offsetMs: number
): ExportCompositionSummary {
  const segments = sortSegments(composition.segments).map((segment) => ({ ...segment }));
  const index = segments.findIndex((segment) => segment.id === segmentId);
  if (index < 0) {
    return composition;
  }

  if (edge === "start") {
    if (index === 0) {
      return composition;
    }

    const previous = segments[index - 1];
    const current = segments[index];
    const nextStart = clamp(
      offsetMs,
      previous.startOffsetMs + MIN_SEGMENT_DURATION_MS,
      current.endOffsetMs - MIN_SEGMENT_DURATION_MS
    );
    previous.endOffsetMs = nextStart;
    previous.source = "manual_edit";
    current.startOffsetMs = nextStart;
    current.source = "manual_edit";
  } else {
    const current = segments[index];
    if (index === segments.length - 1) {
      current.endOffsetMs = Math.max(current.startOffsetMs + MIN_SEGMENT_DURATION_MS, offsetMs);
      current.source = "manual_edit";
      return { ...composition, durationMs: current.endOffsetMs, segments };
    }

    const next = segments[index + 1];
    const nextEnd = clamp(
      offsetMs,
      current.startOffsetMs + MIN_SEGMENT_DURATION_MS,
      next.endOffsetMs - MIN_SEGMENT_DURATION_MS
    );
    current.endOffsetMs = nextEnd;
    current.source = "manual_edit";
    next.startOffsetMs = nextEnd;
    next.source = "manual_edit";
  }

  return { ...composition, segments };
}

export function getPreviewSegment(segments: ExportTimelineSegmentSummary[], playheadMs: number) {
  const sortedSegments = sortSegments(segments);
  const lastSegmentId = sortedSegments.at(-1)?.id;
  return (
    sortedSegments.find(
      (segment) =>
        playheadMs >= segment.startOffsetMs &&
        (playheadMs < segment.endOffsetMs || (segment.id === lastSegmentId && playheadMs === segment.endOffsetMs))
    ) ?? null
  );
}

export function normalizeCompositionDuration(
  composition: ExportCompositionSummary,
  minimumDurationMs: number | null
): ExportCompositionSummary {
  const requiredDurationMs = Math.max(minimumDurationMs ?? 0, composition.durationMs);
  if (requiredDurationMs <= composition.durationMs) {
    return composition;
  }

  const segments = sortSegments(composition.segments).map((segment) => ({ ...segment }));
  const lastSegment = segments.at(-1);
  if (lastSegment) {
    lastSegment.endOffsetMs = Math.max(lastSegment.endOffsetMs, requiredDurationMs);
  }

  return {
    ...composition,
    durationMs: requiredDurationMs,
    segments
  };
}

export function getAppendixWidthPercent(durationMs: number, appendixDurationMs: number): number {
  const totalDuration = Math.max(durationMs + appendixDurationMs, 1);
  return clamp((appendixDurationMs / totalDuration) * 100, 16, 45);
}

export function getFileName(filePath: string): string {
  return filePath.split(/[/\\]/).at(-1) ?? filePath;
}

export function toFileUrl(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/").replace(/^\/+/, "");
  return encodeURI(`file:///${normalized}`);
}
