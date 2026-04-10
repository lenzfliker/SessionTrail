import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AudioAssetSummary,
  ExportCompositionSummary,
  TimelineCheckpointSummary,
  VideoAssetSummary
} from "../../shared/contracts";
import {
  getEffectiveVoiceOverDurationMs,
  getPreviewSegment,
  normalizeCompositionDuration
} from "../utils";

export function useSessionWorkspace(
  selectedSessionId: string | null,
  pendingCheckpointId: string | null
) {
  const [timelineItems, setTimelineItems] = useState<TimelineCheckpointSummary[]>([]);
  const [voiceOver, setVoiceOver] = useState<AudioAssetSummary | null>(null);
  const [appendixVideo, setAppendixVideo] = useState<VideoAssetSummary | null>(null);
  const [composition, setComposition] = useState<ExportCompositionSummary | null>(null);
  const [compositionDirty, setCompositionDirty] = useState(false);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [selectedCheckpointId, setSelectedCheckpointId] = useState<string | null>(null);
  const [playheadMs, setPlayheadMs] = useState(0);
  const [armedCheckpointId, setArmedCheckpointId] = useState<string | null>(null);
  const [previewCache, setPreviewCache] = useState<Record<string, string | null>>({});
  const [audioPreviewDurationMs, setAudioPreviewDurationMs] = useState<number | null>(null);
  const [audioCurrentTimeMs, setAudioCurrentTimeMs] = useState(0);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [loadedSessionId, setLoadedSessionId] = useState<string | null>(null);
  const [sessionSwitching, setSessionSwitching] = useState(false);
  const lastLoadedSessionIdRef = useRef<string | null>(null);
  const loadRequestIdRef = useRef(0);

  const resetWorkspace = (sessionId: string | null) => {
    setTimelineItems([]);
    setVoiceOver(null);
    setAppendixVideo(null);
    setComposition(null);
    setCompositionDirty(false);
    setSelectedSegmentId(null);
    setSelectedCheckpointId(null);
    setPlayheadMs(0);
    setArmedCheckpointId(null);
    setPreviewCache({});
    setAudioPreviewDurationMs(null);
    setAudioCurrentTimeMs(0);
    lastLoadedSessionIdRef.current = sessionId;
    setLoadedSessionId(sessionId);
  };

  const loadSessionWorkspace = async (sessionId: string | null) => {
    const requestId = ++loadRequestIdRef.current;
    const shouldReset = sessionId !== lastLoadedSessionIdRef.current;
    if (shouldReset) {
      resetWorkspace(sessionId);
    }

    if (!sessionId) {
      setLoadedSessionId(null);
      setSessionSwitching(false);
      setWorkspaceLoading(false);
      return;
    }

    setSessionSwitching(Boolean(lastLoadedSessionIdRef.current && lastLoadedSessionIdRef.current !== sessionId));
    setWorkspaceLoading(true);
    try {
      const [nextItems, nextVoiceOver, nextComposition] = await Promise.all([
        window.sessionTrail.checkpoint.listForSession(sessionId),
        window.sessionTrail.audio.getLatestVoiceOver(sessionId),
        window.sessionTrail.export.getComposition(sessionId)
      ]);
      const nextAppendixVideo = nextComposition.appendixVideoAssetId
        ? await window.sessionTrail.video.getById(nextComposition.appendixVideoAssetId)
        : null;

      if (requestId !== loadRequestIdRef.current) {
        return;
      }

      setTimelineItems(nextItems);
      setVoiceOver(nextVoiceOver);
      setAppendixVideo(nextAppendixVideo);
      setComposition(normalizeCompositionDuration(nextComposition, getEffectiveVoiceOverDurationMs(nextVoiceOver)));
      setCompositionDirty(false);
      setPreviewCache({});
      setSelectedSegmentId((current) =>
        current && nextComposition.segments.some((segment) => segment.id === current)
          ? current
          : nextComposition.segments[0]?.id ?? null
      );
      setSelectedCheckpointId((current) =>
        current && nextItems.some((item) => item.id === current)
          ? current
          : nextComposition.segments[0]?.checkpointId ?? nextItems[0]?.id ?? null
      );
      setArmedCheckpointId((current) =>
        current && nextItems.some((item) => item.id === current)
          ? current
          : nextItems.find((item) => item.thumbnailDataUrl)?.id ?? null
      );
      setAudioPreviewDurationMs(nextVoiceOver?.durationMs ?? null);
      setAudioCurrentTimeMs(0);
      lastLoadedSessionIdRef.current = sessionId;
      setLoadedSessionId(sessionId);
    } finally {
      if (requestId === loadRequestIdRef.current) {
        setWorkspaceLoading(false);
        setSessionSwitching(false);
      }
    }
  };

  useEffect(() => {
    void loadSessionWorkspace(selectedSessionId);
  }, [pendingCheckpointId, selectedSessionId]);

  const checkpointsById = useMemo(
    () => new Map(timelineItems.map((item) => [item.id, item] as const)),
    [timelineItems]
  );
  const selectedSegment =
    composition?.segments.find((segment) => segment.id === selectedSegmentId) ?? null;
  const selectedCheckpoint = selectedCheckpointId
    ? checkpointsById.get(selectedCheckpointId) ?? null
    : null;
  const previewSegment = composition ? getPreviewSegment(composition.segments, playheadMs) : null;
  const previewCheckpoint = previewSegment ? checkpointsById.get(previewSegment.checkpointId) ?? null : null;
  const effectiveVoiceDurationMs = getEffectiveVoiceOverDurationMs(voiceOver);
  const selectedCheckpointThumbnailUrl = selectedCheckpoint?.thumbnailDataUrl ?? null;
  const selectedCheckpointPreviewUrl = selectedCheckpoint ? previewCache[selectedCheckpoint.id] ?? null : null;
  const previewCheckpointThumbnailUrl = previewCheckpoint?.thumbnailDataUrl ?? null;
  const previewCheckpointPreviewUrl = previewCheckpoint ? previewCache[previewCheckpoint.id] ?? null : null;

  useEffect(() => {
    if (selectedSegment) {
      setSelectedCheckpointId(selectedSegment.checkpointId);
    }
  }, [selectedSegment?.checkpointId]);

  useEffect(() => {
    const missingPreviewIds = timelineItems
      .filter((item) => item.thumbnailDataUrl && !Object.prototype.hasOwnProperty.call(previewCache, item.id))
      .map((item) => item.id);

    if (missingPreviewIds.length === 0) {
      return;
    }

    let canceled = false;
    void Promise.all(
      missingPreviewIds.map(async (checkpointId) => [checkpointId, await window.sessionTrail.checkpoint.getScreenshotPreview(checkpointId)] as const)
    ).then((entries) => {
      if (canceled) {
        return;
      }

      setPreviewCache((current) => {
        const nextCache = { ...current };
        for (const [checkpointId, preview] of entries) {
          if (!Object.prototype.hasOwnProperty.call(nextCache, checkpointId)) {
            nextCache[checkpointId] = preview;
          }
        }
        return nextCache;
      });
    });

    return () => {
      canceled = true;
    };
  }, [previewCache, timelineItems]);

  return {
    timelineItems,
    setTimelineItems,
    voiceOver,
    setVoiceOver,
    appendixVideo,
    setAppendixVideo,
    composition,
    setComposition,
    compositionDirty,
    setCompositionDirty,
    selectedSegmentId,
    setSelectedSegmentId,
    selectedCheckpointId,
    setSelectedCheckpointId,
    playheadMs,
    setPlayheadMs,
    armedCheckpointId,
    setArmedCheckpointId,
    audioPreviewDurationMs,
    setAudioPreviewDurationMs,
    audioCurrentTimeMs,
    setAudioCurrentTimeMs,
    workspaceLoading,
    loadedSessionId,
    sessionSwitching,
    checkpointsById,
    selectedSegment,
    selectedCheckpoint,
    previewCheckpoint,
    effectiveVoiceDurationMs,
    selectedCheckpointThumbnailUrl,
    selectedCheckpointPreviewUrl,
    previewCheckpointThumbnailUrl,
    previewCheckpointPreviewUrl,
    loadSessionWorkspace
  };
}
