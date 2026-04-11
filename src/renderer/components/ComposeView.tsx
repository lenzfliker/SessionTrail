import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, type MouseEvent, type RefObject } from "react";
import type {
  AudioAssetSummary,
  ExportCompositionSummary,
  ExportJobSummary,
  ExportTimelineSegmentSummary,
  ImportedMediaAssetSummary,
  MediaImportJobSummary,
  SessionSummary,
  TimelineCheckpointSummary,
} from "../../shared/contracts";
import {
  AudioLinesIcon,
  ArrowUpRightIcon,
  BellIcon,
  BookmarkPlusIcon,
  CheckIcon,
  EyeIcon,
  FolderOpenIcon,
  FolderOutputIcon,
  IconLabel,
  MonitorCheckIcon,
  RadioIcon,
  RotateCwIcon,
  XIcon
} from "./animated-icons";
import {
  formatDuration,
  formatDurationFromMs,
  getFileName,
  getWorkedSecondsForDisplay,
  toRendererAssetUrl,
  type RecordingMarker,
  type VisualSourceSelection
} from "../utils";
import { EMPHATIC_TRANSITION, FAST_TRANSITION } from "../motion";

type SegmentStyle = { left: number; width: number };

export type ComposeViewProps = {
  selectedSessionId: string | null;
  loadedSessionId: string | null;
  sessions: SessionSummary[];
  selectedSession: SessionSummary | null;
  canCheckpoint: boolean;
  busy: boolean;
  motionEnabled: boolean;
  recording: boolean;
  compositionDirty: boolean;
  workspaceLoading: boolean;
  sessionSwitching: boolean;
  nowMs: number;
  composition: ExportCompositionSummary | null;
  segmentStyles: Map<string, SegmentStyle>;
  checkpointsById: Map<string, TimelineCheckpointSummary>;
  importedMediaById: Map<string, ImportedMediaAssetSummary>;
  selectedSegmentId: string | null;
  playheadMs: number;
  effectiveVoiceDurationMs: number | null;
  recordingElapsedMs: number;
  importedMedia: ImportedMediaAssetSummary[];
  timelineItems: TimelineCheckpointSummary[];
  activeCheckpointId: string | null;
  activeImportId: string | null;
  recordingMarkers: RecordingMarker[];
  voiceOver: AudioAssetSummary | null;
  voiceOverPreviewUrl: string | null;
  voiceOverPreviewPreparing: boolean;
  audioRef: RefObject<HTMLAudioElement | null>;
  audioPreviewDurationMs: number | null;
  audioCurrentTimeMs: number;
  activeExportJob: ExportJobSummary | null;
  activeMediaImportJob: MediaImportJobSummary | null;
  pendingRecovery: boolean;
  pendingCheckpoint: boolean;
  trackRef: RefObject<HTMLDivElement | null>;
  audioPreviewActive: boolean;
  armedVisualSource: VisualSourceSelection | null;
  selectedCheckpoint: TimelineCheckpointSummary | null;
  selectedCheckpointThumbnailUrl: string | null;
  selectedCheckpointPreviewUrl: string | null;
  selectedImport: ImportedMediaAssetSummary | null;
  previewSegment: ExportTimelineSegmentSummary | null;
  previewCheckpoint: TimelineCheckpointSummary | null;
  previewCheckpointThumbnailUrl: string | null;
  previewCheckpointPreviewUrl: string | null;
  previewImport: ImportedMediaAssetSummary | null;
  selectedSegment: ExportTimelineSegmentSummary | null;
  inspectorNoteText: string;
  canDeleteSelectedCheckpoint: boolean;
  selectedCheckpointDeleteReason: string | null;
  currentImportVideoPlaybackMs: number;
  onSelectSession: (sessionId: string | null) => void;
  onCreateManualCheckpoint: () => void;
  onSaveTimeline: () => void;
  onSelectSegment: (segmentId: string, selection: VisualSourceSelection) => void;
  onResizeHandleMouseDown: (
    segmentId: string,
    edge: "start" | "end",
    event: MouseEvent<HTMLSpanElement>
  ) => void;
  onPlayheadChange: (playheadMs: number) => void;
  onMarkVisualSource: (selection: VisualSourceSelection) => void;
  onToggleRecording: () => void;
  onAudioMetadataLoaded: (durationMs: number) => void;
  onAudioTimeUpdate: (timeMs: number) => void;
  onPreviewVoiceOver: () => void;
  onImportMedia: () => void;
  onDeleteImport: (assetId: string) => void;
  onChooseOutputPath: () => void;
  onRevealOutput: () => void;
  onOpenOutput: () => void;
  onBuildExport: () => void;
  onCancelExport: () => void;
  onRetryBuild: () => void;
  onInspectorNoteChange: (value: string) => void;
  onSaveCheckpointNote: () => void;
  onDeleteSelectedCheckpoint: () => void;
  onAssignSegmentSource: (selection: VisualSourceSelection) => void;
  onImportVideoPlaybackUpdate: (assetId: string, timeMs: number, ended: boolean) => void;
};

const SURFACE_SWITCH_VARIANTS = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 }
};

const STRIP_VARIANTS = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.035,
      delayChildren: 0.04
    }
  },
  exit: {}
};

const CHIP_VARIANTS = {
  hidden: { opacity: 0, y: 8, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -4, scale: 0.98 }
};

function getVisualLabel(sourceKind: VisualSourceSelection["sourceKind"]): string {
  if (sourceKind === "checkpoint") {
    return "Checkpoint";
  }

  return sourceKind === "imported_image" ? "Imported image" : "Imported video";
}

function getVisualChipSelection(asset: ImportedMediaAssetSummary): VisualSourceSelection {
  return {
    sourceKind: asset.kind === "image" ? "imported_image" : "imported_video",
    sourceId: asset.id
  };
}

function MediaViewport({
  checkpoint,
  importedAsset,
  fallbackSrc,
  fullSrc,
  alt,
  playVideo,
  playbackMs,
  onVideoPlaybackUpdate
}: {
  checkpoint?: TimelineCheckpointSummary | null;
  importedAsset?: ImportedMediaAssetSummary | null;
  fallbackSrc?: string | null;
  fullSrc?: string | null;
  alt: string;
  playVideo: boolean;
  playbackMs: number;
  onVideoPlaybackUpdate?: (assetId: string, timeMs: number, ended: boolean) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const assetUrl = importedAsset ? toRendererAssetUrl(importedAsset.filePath) : null;
  const resolvedImageSrc = importedAsset ? assetUrl : (fullSrc ?? fallbackSrc ?? null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !importedAsset || importedAsset.kind !== "video" || !assetUrl) {
      return;
    }

    const targetSeconds = Math.max(0, playbackMs / 1000);
    if (Math.abs(video.currentTime - targetSeconds) > 0.25) {
      video.currentTime = targetSeconds;
    }

    if (playVideo) {
      void video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [assetUrl, importedAsset, playVideo, playbackMs]);

  if (importedAsset?.kind === "video" && assetUrl) {
    return (
      <div className="preview-frame">
        <div className="preview-frame__viewport">
          <video
            ref={videoRef}
            className="preview-frame__video"
            src={assetUrl}
            muted
            playsInline
            preload="metadata"
            onTimeUpdate={(event) =>
              onVideoPlaybackUpdate?.(importedAsset.id, Math.round(event.currentTarget.currentTime * 1000), false)
            }
            onEnded={(event) =>
              onVideoPlaybackUpdate?.(importedAsset.id, Math.round(event.currentTarget.currentTime * 1000), true)
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="preview-frame">
      <div className="preview-frame__viewport">
        {resolvedImageSrc ? (
          <img
            key={`${checkpoint?.id ?? importedAsset?.id ?? "none"}-${resolvedImageSrc}`}
            className="preview-frame__image"
            src={resolvedImageSrc}
            alt={alt}
          />
        ) : (
          <div className="preview-frame__placeholder">Preview unavailable</div>
        )}
      </div>
    </div>
  );
}

export function ComposeView(props: ComposeViewProps) {
  const {
    selectedSessionId,
    loadedSessionId,
    sessions,
    selectedSession,
    canCheckpoint,
    busy,
    motionEnabled,
    recording,
    compositionDirty,
    workspaceLoading,
    sessionSwitching,
    nowMs,
    composition,
    segmentStyles,
    checkpointsById,
    importedMediaById,
    selectedSegmentId,
    playheadMs,
    effectiveVoiceDurationMs,
    recordingElapsedMs,
    importedMedia,
    timelineItems,
    activeCheckpointId,
    activeImportId,
    recordingMarkers,
    voiceOver,
    voiceOverPreviewUrl,
    voiceOverPreviewPreparing,
    audioRef,
    audioPreviewDurationMs,
    audioCurrentTimeMs,
    activeExportJob,
    activeMediaImportJob,
    pendingRecovery,
    pendingCheckpoint,
    trackRef,
    audioPreviewActive,
    armedVisualSource,
    selectedCheckpoint,
    selectedCheckpointThumbnailUrl,
    selectedCheckpointPreviewUrl,
    selectedImport,
    previewSegment,
    previewCheckpoint,
    previewCheckpointThumbnailUrl,
    previewCheckpointPreviewUrl,
    previewImport,
    selectedSegment,
    inspectorNoteText,
    canDeleteSelectedCheckpoint,
    selectedCheckpointDeleteReason,
    currentImportVideoPlaybackMs,
    onSelectSession,
    onCreateManualCheckpoint,
    onSaveTimeline,
    onSelectSegment,
    onResizeHandleMouseDown,
    onPlayheadChange,
    onMarkVisualSource,
    onToggleRecording,
    onAudioMetadataLoaded,
    onAudioTimeUpdate,
    onPreviewVoiceOver,
    onImportMedia,
    onDeleteImport,
    onChooseOutputPath,
    onRevealOutput,
    onOpenOutput,
    onBuildExport,
    onCancelExport,
    onRetryBuild,
    onInspectorNoteChange,
    onSaveCheckpointNote,
    onDeleteSelectedCheckpoint,
    onAssignSegmentSource,
    onImportVideoPlaybackUpdate
  } = props;
  const availableCheckpoints = timelineItems.filter((item) => item.thumbnailDataUrl);
  const audioDurationMs = audioPreviewDurationMs ?? voiceOver?.durationMs ?? 0;
  const playheadPercent = composition?.durationMs ? (playheadMs / composition.durationMs) * 100 : 0;
  const voiceTrackWidth = composition?.durationMs
    ? Math.min(100, ((effectiveVoiceDurationMs ?? composition.durationMs) / composition.durationMs) * 100)
    : 0;
  const loadingMessage = "Loading session workspace...";
  const mediaImportJob =
    activeMediaImportJob && activeMediaImportJob.sessionId === selectedSessionId ? activeMediaImportJob : null;
  const inspectorCheckpoint = audioPreviewActive && previewCheckpoint ? previewCheckpoint : selectedCheckpoint;
  const inspectorImport = audioPreviewActive && previewImport ? previewImport : selectedImport;
  const inspectorCheckpointThumbnailUrl =
    audioPreviewActive && previewCheckpoint ? previewCheckpointThumbnailUrl : selectedCheckpointThumbnailUrl;
  const inspectorCheckpointPreviewUrl =
    audioPreviewActive && previewCheckpoint ? previewCheckpointPreviewUrl : selectedCheckpointPreviewUrl;
  const inspectorBadge = audioPreviewActive
    ? "preview"
    : selectedImport
      ? selectedImport.kind
      : selectedCheckpoint
        ? "checkpoint"
        : selectedSegment
          ? "segment"
          : "idle";
  const inspectorPreviewNote = previewCheckpoint?.noteText?.trim() || "No note";
  const sessionSurfaceKey = loadedSessionId ?? "none";
  const showTimelineSkeleton = sessionSwitching || (workspaceLoading && selectedSessionId !== null);
  const segmentSourceSelection = selectedSegment
    ? { sourceKind: selectedSegment.sourceKind, sourceId: selectedSegment.sourceId }
    : null;
  const activeInspectorVideoMs = audioPreviewActive && previewSegment?.sourceKind === "imported_video"
    ? previewSegment.mediaStartOffsetMs + Math.max(0, playheadMs - previewSegment.startOffsetMs)
    : currentImportVideoPlaybackMs;
  const segmentSourceOptions = useMemo(
    () => [
      ...availableCheckpoints.map((item) => ({
        label: `${formatDuration(item.workedOffsetSeconds)} ${item.manualCheckpoint ? "manual" : "reminder"}`,
        selection: { sourceKind: "checkpoint" as const, sourceId: item.id }
      })),
      ...importedMedia.map((asset) => ({
        label: `${asset.kind === "image" ? "Image" : "Video"} ${getFileName(asset.filePath)}`,
        selection: getVisualChipSelection(asset)
      }))
    ],
    [availableCheckpoints, importedMedia]
  );

  return (
    <div className="workspace workspace--compose">
      <section className="panel panel--main">
        <div className="panel__header">
          <h2>Compose</h2>
          <span className="badge">{selectedSession?.status ?? "none"}</span>
        </div>
        {selectedSession ? (
          <>
            <div className="compose-toolbar">
              <label className="field compose-toolbar__field">
                <span>Session</span>
                <div className={workspaceLoading ? "select-shell select-shell--loading" : "select-shell"}>
                  <select
                    value={selectedSessionId ?? ""}
                    disabled={recording}
                    onChange={(event) => onSelectSession(event.target.value || null)}
                  >
                    {sessions.map((session) => (
                      <option key={session.id} value={session.id}>
                        {session.title}
                      </option>
                    ))}
                  </select>
                  {workspaceLoading ? <span className="select-shell__loader" aria-hidden="true" /> : null}
                </div>
              </label>
              <div className="compose-toolbar__actions">
                <button type="button" className="button" disabled={!canCheckpoint || busy} onClick={onCreateManualCheckpoint}>
                  <IconLabel icon={BookmarkPlusIcon} label="Manual checkpoint" />
                </button>
                <button type="button" className="button button--ghost" disabled={!compositionDirty || busy} onClick={onSaveTimeline}>
                  <IconLabel icon={CheckIcon} label="Save timeline" />
                </button>
              </div>
            </div>
            <div className="compose-session-summary">
              <div><span>Status</span><strong>{selectedSession.status}</strong></div>
              <div><span>Worked</span><strong>{formatDuration(getWorkedSecondsForDisplay(selectedSession, nowMs))}</strong></div>
              <div><span>Target</span><strong>{formatDuration(selectedSession.targetWorkSeconds)}</strong></div>
            </div>
            <div className="section-label-row">
              <span className="eyebrow compose-section-label">Timeline</span>
            </div>
            {showTimelineSkeleton ? (
              <div className="compose-skeleton" aria-hidden="true">
                <div className="compose-skeleton__ruler" />
                <div className="compose-skeleton__track" />
                <div className="compose-skeleton__track compose-skeleton__track--wide" />
                <div className="compose-skeleton__scrubber" />
                <div className="compose-skeleton__chips">
                  <span className="compose-skeleton__chip" />
                  <span className="compose-skeleton__chip" />
                  <span className="compose-skeleton__chip" />
                  <span className="compose-skeleton__chip" />
                </div>
              </div>
            ) : composition ? (
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={sessionSurfaceKey}
                  className="compose-session-motion"
                  initial={motionEnabled ? "hidden" : false}
                  animate="visible"
                  exit={motionEnabled ? "exit" : undefined}
                  variants={SURFACE_SWITCH_VARIANTS}
                  transition={motionEnabled ? FAST_TRANSITION : undefined}
                >
                  <div className="timeline-ruler">
                    <span>00:00</span>
                    <span>{formatDurationFromMs(composition.durationMs)}</span>
                  </div>
                  <div className="track-stack" ref={trackRef}>
                    <div className="track-row">
                      <span className="track-label">Visuals</span>
                      <div className="track-rail">
                        {composition.segments
                          .slice()
                          .sort((left, right) => left.startOffsetMs - right.startOffsetMs)
                          .map((segment) => {
                            const style = segmentStyles.get(segment.id) ?? { left: 0, width: 0 };
                            const checkpoint = segment.sourceKind === "checkpoint"
                              ? checkpointsById.get(segment.sourceId)
                              : null;
                            const importedAsset = segment.sourceKind !== "checkpoint"
                              ? importedMediaById.get(segment.sourceId)
                              : null;
                            const segmentClassName =
                              segment.sourceKind === "checkpoint"
                                ? "segment"
                                : segment.sourceKind === "imported_image"
                                  ? "segment segment--import-image"
                                  : "segment segment--import-video";
                            const segmentLabel = checkpoint?.noteText?.trim()
                              || importedAsset?.filePath && getFileName(importedAsset.filePath)
                              || getVisualLabel(segment.sourceKind);

                            return (
                              <button
                                key={segment.id}
                                type="button"
                                className={selectedSegmentId === segment.id ? `${segmentClassName} segment--selected` : segmentClassName}
                                style={{ left: `${style.left}%`, width: `${style.width}%` }}
                                onClick={() => onSelectSegment(segment.id, { sourceKind: segment.sourceKind, sourceId: segment.sourceId })}
                              >
                                <span className="handle handle--left" onMouseDown={(event) => onResizeHandleMouseDown(segment.id, "start", event)} />
                                <span className="segment__text">{segmentLabel}</span>
                                <span className="handle handle--right" onMouseDown={(event) => onResizeHandleMouseDown(segment.id, "end", event)} />
                              </button>
                            );
                          })}
                        <motion.div
                          className="playhead"
                          animate={motionEnabled ? { left: `${playheadPercent}%` } : undefined}
                          transition={motionEnabled ? FAST_TRANSITION : undefined}
                          style={motionEnabled ? undefined : { left: `${playheadPercent}%` }}
                        />
                      </div>
                    </div>
                    <div className="track-row">
                      <span className="track-label">Voice</span>
                      <div className="track-rail">
                        <div className="track-block track-block--voice" style={{ width: `${voiceTrackWidth}%` }}>
                          {recording ? (
                            <span className="track-block__label">
                              <AudioLinesIcon size={17} active={motionEnabled} />
                              <span>Recording {formatDurationFromMs(recordingElapsedMs)}</span>
                            </span>
                          ) : voiceOver ? `Voice ${formatDurationFromMs(effectiveVoiceDurationMs ?? composition.durationMs)}` : "No recorded voice-over"}
                        </div>
                      </div>
                    </div>
                  </div>
                  <label className="field">
                    <span>Playhead</span>
                    <input
                      type="range"
                      min="0"
                      max={String(Math.max(0, composition.durationMs))}
                      step="100"
                      value={String(playheadMs)}
                      onChange={(event) => onPlayheadChange(Number(event.target.value))}
                    />
                  </label>
                  <motion.div className="checkpoint-strip" initial={motionEnabled ? "hidden" : false} animate="visible" exit={motionEnabled ? "exit" : undefined} variants={STRIP_VARIANTS}>
                    {availableCheckpoints.map((item) => (
                      <motion.button
                        key={`${selectedSessionId ?? "none"}-${item.id}`}
                        type="button"
                        className={activeCheckpointId === item.id ? "checkpoint-chip checkpoint-chip--active" : "checkpoint-chip"}
                        onClick={() => onMarkVisualSource({ sourceKind: "checkpoint", sourceId: item.id })}
                        initial={motionEnabled ? "hidden" : false}
                        animate="visible"
                        exit={motionEnabled ? "exit" : undefined}
                        variants={CHIP_VARIANTS}
                        transition={motionEnabled ? FAST_TRANSITION : undefined}
                      >
                        {item.thumbnailDataUrl ? <img src={item.thumbnailDataUrl} alt="" /> : null}
                        <IconLabel
                          icon={item.manualCheckpoint ? BookmarkPlusIcon : BellIcon}
                          label={formatDuration(item.workedOffsetSeconds)}
                          size={14}
                          className="checkpoint-chip__meta"
                        />
                      </motion.button>
                    ))}
                  </motion.div>
                  <motion.div className="import-strip" initial={motionEnabled ? "hidden" : false} animate="visible" exit={motionEnabled ? "exit" : undefined} variants={STRIP_VARIANTS}>
                    {importedMedia.length > 0 ? importedMedia.map((asset) => {
                      const selection = getVisualChipSelection(asset);
                      const isActive = activeImportId === asset.id;
                      const progressPercent = asset.kind === "video" && asset.durationMs
                        ? Math.min(100, (currentImportVideoPlaybackMs / asset.durationMs) * 100)
                        : 0;

                      return (
                        <motion.button
                          key={`${selectedSessionId ?? "none"}-import-${asset.id}`}
                          type="button"
                          className={isActive ? "checkpoint-chip checkpoint-chip--active checkpoint-chip--import" : "checkpoint-chip checkpoint-chip--import"}
                          onClick={() => onMarkVisualSource(selection)}
                          initial={motionEnabled ? "hidden" : false}
                          animate="visible"
                          exit={motionEnabled ? "exit" : undefined}
                          variants={CHIP_VARIANTS}
                          transition={motionEnabled ? FAST_TRANSITION : undefined}
                        >
                          {asset.kind === "image" ? (
                            <img src={toRendererAssetUrl(asset.filePath)} alt="" />
                          ) : (
                            <video className="checkpoint-chip__video" src={toRendererAssetUrl(asset.filePath)} muted preload="metadata" />
                          )}
                          <span className="checkpoint-chip__meta checkpoint-chip__meta--stacked">
                            <strong>{asset.kind === "image" ? "Image" : "Video"}</strong>
                            <span>{getFileName(asset.filePath)}</span>
                          </span>
                          {asset.kind === "video" ? <span className="chip-progress" aria-hidden="true"><span style={{ width: `${progressPercent}%` }} /></span> : null}
                        </motion.button>
                      );
                    }) : (
                      <div className="track-block track-block--empty track-block--empty-inline">No imported media</div>
                    )}
                  </motion.div>
                  {recordingMarkers.length > 0 && recording ? (
                    <div className="recording-list">
                      {recordingMarkers.map((marker, index) => {
                        const checkpoint = marker.sourceKind === "checkpoint" ? checkpointsById.get(marker.sourceId) : null;
                        const importedAsset = marker.sourceKind !== "checkpoint" ? importedMediaById.get(marker.sourceId) : null;
                        const label = checkpoint?.noteText?.trim()
                          || importedAsset?.filePath && getFileName(importedAsset.filePath)
                          || getVisualLabel(marker.sourceKind);
                        return <div key={`${marker.sourceId}-${marker.offsetMs}-${index}`}>{formatDurationFromMs(marker.offsetMs)} - {label}</div>;
                      })}
                    </div>
                  ) : null}
                </motion.div>
              </AnimatePresence>
            ) : (
              <div className="empty-state">No timeline composition is available for this session.</div>
            )}
            <section className="panel">
              <div className="panel__header">
                <h2>Voice-over</h2>
                <span className="badge">{voiceOver ? "recorded" : "empty"}</span>
              </div>
              <div className="button-row">
                <button type="button" className="button button--ghost" disabled={busy} onClick={onToggleRecording}>
                  <IconLabel icon={recording ? XIcon : RadioIcon} label={recording ? "Stop recording" : "Record voice-over"} />
                </button>
                {voiceOver ? (
                  <button type="button" className="button button--ghost" disabled={busy || recording || voiceOverPreviewPreparing} onClick={onPreviewVoiceOver}>
                    <IconLabel icon={EyeIcon} label={voiceOverPreviewPreparing ? "Preparing voice-over..." : "Preview voice-over"} />
                  </button>
                ) : null}
              </div>
              {voiceOver ? (
                <>
                  {voiceOverPreviewUrl ? (
                    <audio
                      ref={audioRef}
                      className="audio-preview"
                      src={voiceOverPreviewUrl}
                      controls
                      preload="metadata"
                      onLoadedMetadata={(event) => {
                        const durationSeconds = event.currentTarget.duration;
                        if (Number.isFinite(durationSeconds) && durationSeconds > 0) {
                          onAudioMetadataLoaded(Math.round(durationSeconds * 1000));
                        }
                      }}
                      onTimeUpdate={(event) => onAudioTimeUpdate(Math.round(event.currentTarget.currentTime * 1000))}
                    />
                  ) : (
                    <div className="empty-state">{voiceOverPreviewPreparing ? "Preparing voice-over..." : "Preview voice-over to prepare playback."}</div>
                  )}
                  <div className="trim-stats">
                    <div><span>Duration</span><strong>{formatDurationFromMs(audioDurationMs)}</strong></div>
                    <div><span>Playhead</span><strong>{formatDurationFromMs(audioCurrentTimeMs)}</strong></div>
                  </div>
                </>
              ) : (
                <div className="empty-state">No recorded voice-over yet.</div>
              )}
            </section>

            <section className="panel">
              <div className="panel__header">
                <h2>Imports</h2>
                <span className="badge">{importedMedia.length}</span>
              </div>
              <div className="button-row">
                <button type="button" className="button" disabled={busy || recording || mediaImportJob?.status === "running"} onClick={onImportMedia}>
                  <IconLabel icon={FolderOpenIcon} label="Import images or videos" />
                </button>
                {selectedImport ? (
                  <button type="button" className="button button--ghost" disabled={busy || recording || mediaImportJob?.status === "running"} onClick={() => onDeleteImport(selectedImport.id)}>
                    <IconLabel icon={XIcon} label="Delete selected import" />
                  </button>
                ) : null}
              </div>
              {mediaImportJob ? (
                <div className="media-import-status">
                  <div className="progress">
                    <div className="progress__bar" style={{ width: `${Math.round(mediaImportJob.progressRatio * 100)}%` }} />
                  </div>
                  <div className="media-import-status__copy">
                    <strong>{mediaImportJob.message}</strong>
                    {mediaImportJob.errorMessage ? <span>{mediaImportJob.errorMessage}</span> : null}
                  </div>
                </div>
              ) : null}
              {selectedImport ? (
                <div className="media-summary">
                  <strong>{getFileName(selectedImport.filePath)}</strong>
                  <span>{selectedImport.kind === "video" ? (selectedImport.durationMs ? formatDurationFromMs(selectedImport.durationMs) : "Duration unavailable") : "Still image"}</span>
                </div>
              ) : (
                <div className="empty-state">No import selected.</div>
              )}
            </section>

            <section className="panel">
              <div className="panel__header">
                <h2>Export</h2>
                <span className="badge">{activeExportJob?.status ?? "idle"}</span>
              </div>
              <div className="empty-state">{composition?.outputFilePath ?? "No export destination selected."}</div>
              <div className="button-row">
                <button type="button" className="button button--ghost" disabled={busy || recording} onClick={onChooseOutputPath}>
                  <IconLabel icon={FolderOutputIcon} label="Change location" />
                </button>
                <button type="button" className="button button--ghost" disabled={busy} onClick={onRevealOutput}>
                  <IconLabel icon={FolderOpenIcon} label="Reveal in folder" />
                </button>
                <button type="button" className="button button--ghost" disabled={busy} onClick={onOpenOutput}>
                  <IconLabel icon={ArrowUpRightIcon} label="Open file" />
                </button>
              </div>
              <AnimatePresence mode="popLayout">
                {activeExportJob ? (
                  <motion.div key={activeExportJob.id} initial={motionEnabled ? { opacity: 0, y: 8 } : false} animate={motionEnabled ? { opacity: 1, y: 0 } : undefined} exit={motionEnabled ? { opacity: 0, y: -6 } : undefined} transition={motionEnabled ? FAST_TRANSITION : undefined}>
                    <div className="progress progress--animated">
                      <motion.div className="progress__bar" animate={motionEnabled ? { width: `${Math.round(activeExportJob.progressRatio * 100)}%` } : undefined} transition={motionEnabled ? EMPHATIC_TRANSITION : undefined} style={motionEnabled ? undefined : { width: `${Math.round(activeExportJob.progressRatio * 100)}%` }} />
                    </div>
                    <motion.div className="empty-state" key={`${activeExportJob.status}-${activeExportJob.message}`} initial={motionEnabled ? { opacity: 0, y: 8 } : false} animate={motionEnabled ? { opacity: 1, y: 0 } : undefined} exit={motionEnabled ? { opacity: 0, y: -6 } : undefined} transition={motionEnabled ? FAST_TRANSITION : undefined}>
                      {activeExportJob.message}
                    </motion.div>
                  </motion.div>
                ) : (
                  <motion.div key="export-idle" className="empty-state" initial={motionEnabled ? { opacity: 0, y: 8 } : false} animate={motionEnabled ? { opacity: 1, y: 0 } : undefined} exit={motionEnabled ? { opacity: 0, y: -6 } : undefined} transition={motionEnabled ? FAST_TRANSITION : undefined}>
                    No export running.
                  </motion.div>
                )}
              </AnimatePresence>
              <div className="button-row">
                <button type="button" className="button" disabled={busy || recording || pendingRecovery || pendingCheckpoint} onClick={onBuildExport}>
                  <IconLabel icon={MonitorCheckIcon} label="Render video" />
                </button>
                <button type="button" className="button button--ghost" disabled={busy || activeExportJob?.status !== "running"} onClick={onCancelExport}>
                  <IconLabel icon={XIcon} label="Cancel export" />
                </button>
                <button type="button" className="button button--ghost" disabled={busy || recording} onClick={onRetryBuild}>
                  <IconLabel icon={RotateCwIcon} label="Retry render" />
                </button>
              </div>
            </section>
          </>
        ) : (
          <div className="empty-state">Select a session to edit.</div>
        )}
      </section>

      <aside className="sidebar">
        <section className="panel">
          <div className="panel__header">
            <h2>Inspector</h2>
            <span className="badge">{inspectorBadge}</span>
          </div>
          {workspaceLoading && !selectedCheckpoint && !previewCheckpoint && !selectedImport && !previewImport ? (
            <div className="empty-state">{loadingMessage}</div>
          ) : audioPreviewActive && previewCheckpoint ? (
            <>
              <div className="stats">
                <div><span>Checkpoint</span><strong>{previewCheckpoint.manualCheckpoint ? "Manual" : "Reminder"}</strong></div>
                <div><span>Worked offset</span><strong>{formatDuration(previewCheckpoint.workedOffsetSeconds)}</strong></div>
                <div><span>Playhead</span><strong>{formatDurationFromMs(playheadMs)}</strong></div>
              </div>
              <MediaViewport checkpoint={previewCheckpoint} fallbackSrc={previewCheckpointThumbnailUrl} fullSrc={previewCheckpointPreviewUrl} alt="Preview checkpoint" playVideo={false} playbackMs={0} />
              <div className="empty-state">{inspectorPreviewNote} at {formatDurationFromMs(playheadMs)}</div>
            </>
          ) : inspectorImport ? (
            <>
              <div className="stats">
                <div><span>Type</span><strong>{inspectorImport.kind}</strong></div>
                <div><span>Selection</span><strong>{armedVisualSource?.sourceId === inspectorImport.id ? "armed" : "idle"}</strong></div>
                <div><span>Playhead</span><strong>{formatDurationFromMs(activeInspectorVideoMs)}</strong></div>
              </div>
              <MediaViewport
                importedAsset={inspectorImport}
                alt="Selected import"
                playVideo={Boolean((recording && armedVisualSource?.sourceId === inspectorImport.id) || (audioPreviewActive && previewImport?.id === inspectorImport.id))}
                playbackMs={activeInspectorVideoMs}
                onVideoPlaybackUpdate={onImportVideoPlaybackUpdate}
              />
              <div className="empty-state">{getFileName(inspectorImport.filePath)}</div>
            </>
          ) : inspectorCheckpoint ? (
            <>
              <div className="stats">
                <div><span>Checkpoint</span><strong>{inspectorCheckpoint.manualCheckpoint ? "Manual" : "Reminder"}</strong></div>
                <div><span>Worked offset</span><strong>{formatDuration(inspectorCheckpoint.workedOffsetSeconds)}</strong></div>
                <div><span>Status</span><strong>{inspectorCheckpoint.status}</strong></div>
              </div>
              <MediaViewport checkpoint={inspectorCheckpoint} fallbackSrc={inspectorCheckpointThumbnailUrl} fullSrc={inspectorCheckpointPreviewUrl} alt="Selected checkpoint" playVideo={false} playbackMs={0} />
              {inspectorCheckpoint.status === "completed" ? (
                <>
                  <label className="field">
                    <span>Checkpoint note</span>
                    <textarea rows={5} value={inspectorNoteText} onChange={(event) => onInspectorNoteChange(event.target.value)} />
                  </label>
                  <div className="button-row">
                    <button type="button" className="button" disabled={busy || inspectorNoteText.trim().length === 0} onClick={onSaveCheckpointNote}>
                      <IconLabel icon={CheckIcon} label="Save note" />
                    </button>
                    <button type="button" className="button button--ghost" disabled={busy || !canDeleteSelectedCheckpoint} onClick={onDeleteSelectedCheckpoint}>
                      <IconLabel icon={XIcon} label="Delete checkpoint" />
                    </button>
                  </div>
                  {selectedCheckpointDeleteReason ? <div className="empty-state">{selectedCheckpointDeleteReason}</div> : null}
                </>
              ) : (
                <div className="empty-state">{inspectorCheckpoint.noteText?.trim() || "No saved note for this checkpoint yet."}</div>
              )}
            </>
          ) : (
            <div className="empty-state">Select a visual or move the playhead to preview the timeline.</div>
          )}

          {selectedSegment && composition ? (
            <>
              <label className="field">
                <span>Segment visual</span>
                <select
                  value={segmentSourceSelection ? `${segmentSourceSelection.sourceKind}:${segmentSourceSelection.sourceId}` : ""}
                  onChange={(event) => {
                    const [sourceKind, sourceId] = event.target.value.split(":");
                    if (!sourceKind || !sourceId) {
                      return;
                    }
                    onAssignSegmentSource({ sourceKind: sourceKind as VisualSourceSelection["sourceKind"], sourceId });
                  }}
                >
                  {segmentSourceOptions.map((option) => (
                    <option key={`${option.selection.sourceKind}:${option.selection.sourceId}`} value={`${option.selection.sourceKind}:${option.selection.sourceId}`}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="stats">
                <div><span>Start</span><strong>{formatDurationFromMs(selectedSegment.startOffsetMs)}</strong></div>
                <div><span>End</span><strong>{formatDurationFromMs(selectedSegment.endOffsetMs)}</strong></div>
                <div><span>Duration</span><strong>{formatDurationFromMs(selectedSegment.endOffsetMs - selectedSegment.startOffsetMs)}</strong></div>
              </div>
            </>
          ) : null}
        </section>
      </aside>
    </div>
  );
}
