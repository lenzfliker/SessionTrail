import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type MouseEvent, type RefObject } from "react";
import type {
  AudioAssetSummary,
  ExportCompositionSummary,
  ExportJobSummary,
  ExportTimelineSegmentSummary,
  MediaImportJobSummary,
  SessionSummary,
  TimelineCheckpointSummary,
  VideoAssetSummary
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
  getAppendixWidthPercent,
  getFileName,
  getWorkedSecondsForDisplay
} from "../utils";
import { EMPHATIC_TRANSITION, FAST_TRANSITION } from "../motion";
import type { RecordingMarker } from "../utils";

type SegmentStyle = { left: number; width: number };

type ComposeViewProps = {
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
  selectedSegmentId: string | null;
  playheadMs: number;
  effectiveVoiceDurationMs: number | null;
  recordingElapsedMs: number;
  appendixVideo: VideoAssetSummary | null;
  timelineItems: TimelineCheckpointSummary[];
  activeCheckpointId: string | null;
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
  selectedCheckpoint: TimelineCheckpointSummary | null;
  selectedCheckpointThumbnailUrl: string | null;
  selectedCheckpointPreviewUrl: string | null;
  previewCheckpoint: TimelineCheckpointSummary | null;
  previewCheckpointThumbnailUrl: string | null;
  previewCheckpointPreviewUrl: string | null;
  selectedSegment: ExportTimelineSegmentSummary | null;
  inspectorNoteText: string;
  onSelectSession: (sessionId: string | null) => void;
  onCreateManualCheckpoint: () => void;
  onSaveTimeline: () => void;
  onSelectSegment: (segmentId: string, checkpointId: string) => void;
  onResizeHandleMouseDown: (
    segmentId: string,
    edge: "start" | "end",
    event: MouseEvent<HTMLSpanElement>
  ) => void;
  onPlayheadChange: (playheadMs: number) => void;
  onMarkCheckpoint: (checkpointId: string) => void;
  onToggleRecording: () => void;
  onAudioMetadataLoaded: (durationMs: number) => void;
  onAudioTimeUpdate: (timeMs: number) => void;
  onPreviewVoiceOver: () => void;
  onImportAppendix: () => void;
  onRemoveAppendix: () => void;
  onChooseOutputPath: () => void;
  onRevealOutput: () => void;
  onOpenOutput: () => void;
  onBuildExport: () => void;
  onCancelExport: () => void;
  onRetryBuild: () => void;
  onInspectorNoteChange: (value: string) => void;
  onSaveCheckpointNote: () => void;
  onAssignSegmentCheckpoint: (checkpointId: string) => void;
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

function PreviewFrame({
  checkpoint,
  fallbackSrc,
  fullSrc,
  alt
}: {
  checkpoint: TimelineCheckpointSummary | null;
  fallbackSrc: string | null;
  fullSrc: string | null;
  alt: string;
}) {
  const lastCheckpointIdRef = useRef<string | null>(checkpoint?.id ?? null);
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(fullSrc ?? fallbackSrc ?? null);

  useEffect(() => {
    if (checkpoint?.id !== lastCheckpointIdRef.current) {
      lastCheckpointIdRef.current = checkpoint?.id ?? null;
      setResolvedSrc(fullSrc ?? fallbackSrc ?? null);
    }
  }, [checkpoint?.id, fallbackSrc, fullSrc]);

  useEffect(() => {
    if (!fullSrc || fullSrc === fallbackSrc) {
      return;
    }

    let canceled = false;
    const image = new Image();
    image.onload = () => {
      if (!canceled) {
        setResolvedSrc(fullSrc);
      }
    };
    image.onerror = () => {
      if (!canceled) {
        setResolvedSrc(fallbackSrc ?? null);
      }
    };
    image.src = fullSrc;

    return () => {
      canceled = true;
    };
  }, [fallbackSrc, fullSrc]);

  return (
    <div className="preview-frame">
      <div className="preview-frame__viewport">
        {resolvedSrc ? (
          <img
            key={`${checkpoint?.id ?? "none"}-${resolvedSrc}`}
            className="preview-frame__image"
            src={resolvedSrc}
            alt={alt}
          />
        ) : (
          <div className="preview-frame__placeholder">Preview unavailable</div>
        )}
      </div>
    </div>
  );
}

export function ComposeView({
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
  selectedSegmentId,
  playheadMs,
  effectiveVoiceDurationMs,
  recordingElapsedMs,
  appendixVideo,
  timelineItems,
  activeCheckpointId,
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
  selectedCheckpoint,
  selectedCheckpointThumbnailUrl,
  selectedCheckpointPreviewUrl,
  previewCheckpoint,
  previewCheckpointThumbnailUrl,
  previewCheckpointPreviewUrl,
  selectedSegment,
  inspectorNoteText,
  onSelectSession,
  onCreateManualCheckpoint,
  onSaveTimeline,
  onSelectSegment,
  onResizeHandleMouseDown,
  onPlayheadChange,
  onMarkCheckpoint,
  onToggleRecording,
  onAudioMetadataLoaded,
  onAudioTimeUpdate,
  onPreviewVoiceOver,
  onImportAppendix,
  onRemoveAppendix,
  onChooseOutputPath,
  onRevealOutput,
  onOpenOutput,
  onBuildExport,
  onCancelExport,
  onRetryBuild,
  onInspectorNoteChange,
  onSaveCheckpointNote,
  onAssignSegmentCheckpoint
}: ComposeViewProps) {
  const availableCheckpoints = timelineItems.filter((item) => item.thumbnailDataUrl);
  const audioDurationMs = audioPreviewDurationMs ?? voiceOver?.durationMs ?? 0;
  const playheadPercent = composition?.durationMs ? (playheadMs / composition.durationMs) * 100 : 0;
  const voiceTrackWidth = composition?.durationMs
    ? Math.min(100, ((effectiveVoiceDurationMs ?? composition.durationMs) / composition.durationMs) * 100)
    : 0;
  const loadingMessage = "Loading session workspace...";
  const appendixImportJob =
    activeMediaImportJob && activeMediaImportJob.sessionId === selectedSessionId ? activeMediaImportJob : null;
  const inspectorCheckpoint = audioPreviewActive && previewCheckpoint ? previewCheckpoint : selectedCheckpoint;
  const inspectorCheckpointThumbnailUrl =
    audioPreviewActive && previewCheckpoint ? previewCheckpointThumbnailUrl : selectedCheckpointThumbnailUrl;
  const inspectorCheckpointPreviewUrl =
    audioPreviewActive && previewCheckpoint ? previewCheckpointPreviewUrl : selectedCheckpointPreviewUrl;
  const inspectorBadge = audioPreviewActive && previewCheckpoint
    ? "preview"
    : selectedCheckpoint
      ? "checkpoint"
      : selectedSegment
        ? "segment"
        : "idle";
  const inspectorPreviewNote = previewCheckpoint?.noteText?.trim() || "No note";
  const sessionSurfaceKey = loadedSessionId ?? "none";
  const showTimelineSkeleton = sessionSwitching || (workspaceLoading && selectedSessionId !== null);

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
                <button
                  type="button"
                  className="button"
                  disabled={!canCheckpoint || busy}
                  onClick={onCreateManualCheckpoint}
                >
                  <IconLabel icon={BookmarkPlusIcon} label="Manual checkpoint" />
                </button>
                <button
                  type="button"
                  className="button button--ghost"
                  disabled={!compositionDirty || busy}
                  onClick={onSaveTimeline}
                >
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
                <div className="compose-skeleton__track" />
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
                      <span className="track-label">Screens</span>
                      <div className="track-rail">
                        {composition.segments
                          .slice()
                          .sort((left, right) => left.startOffsetMs - right.startOffsetMs)
                          .map((segment) => {
                            const style = segmentStyles.get(segment.id) ?? { left: 0, width: 0 };
                            const checkpoint = checkpointsById.get(segment.checkpointId);
                            return (
                              <button
                                key={segment.id}
                                type="button"
                                className={selectedSegmentId === segment.id ? "segment segment--selected" : "segment"}
                                style={{ left: `${style.left}%`, width: `${style.width}%` }}
                                onClick={() => onSelectSegment(segment.id, segment.checkpointId)}
                              >
                                <span
                                  className="handle handle--left"
                                  onMouseDown={(event) => onResizeHandleMouseDown(segment.id, "start", event)}
                                />
                                <span className="segment__text">{checkpoint?.noteText?.trim() || "Checkpoint"}</span>
                                <span
                                  className="handle handle--right"
                                  onMouseDown={(event) => onResizeHandleMouseDown(segment.id, "end", event)}
                                />
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
                          {recording
                            ? (
                              <span className="track-block__label">
                                <AudioLinesIcon size={17} active={motionEnabled} />
                                <span>Recording {formatDurationFromMs(recordingElapsedMs)}</span>
                              </span>
                            )
                            : voiceOver
                              ? `Voice ${formatDurationFromMs(effectiveVoiceDurationMs ?? composition.durationMs)}`
                              : "No recorded voice-over"}
                        </div>
                      </div>
                    </div>
                    <div className="track-row">
                      <span className="track-label">Appendix</span>
                      <div className="track-rail">
                        {appendixVideo?.durationMs ? (
                          <div
                            className="track-appendix-tail"
                            style={{ width: `${getAppendixWidthPercent(composition.durationMs, appendixVideo.durationMs)}%` }}
                          >
                            <span className="track-appendix-tail__connector" aria-hidden="true" />
                            <div className="track-block track-block--appendix track-block--appendix-inline">
                              Appendix {formatDurationFromMs(appendixVideo.durationMs)}
                            </div>
                          </div>
                        ) : (
                          <div className="track-block track-block--empty">No appendix</div>
                        )}
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
                  <motion.div
                    className="checkpoint-strip"
                    initial={motionEnabled ? "hidden" : false}
                    animate="visible"
                    exit={motionEnabled ? "exit" : undefined}
                    variants={STRIP_VARIANTS}
                  >
                    {availableCheckpoints.map((item) => (
                      <motion.button
                        key={`${selectedSessionId ?? "none"}-${item.id}`}
                        type="button"
                        className={activeCheckpointId === item.id ? "checkpoint-chip checkpoint-chip--active" : "checkpoint-chip"}
                        onClick={() => onMarkCheckpoint(item.id)}
                        initial={motionEnabled ? "hidden" : false}
                        animate="visible"
                        exit={motionEnabled ? "exit" : undefined}
                        variants={CHIP_VARIANTS}
                        transition={motionEnabled ? FAST_TRANSITION : undefined}
                      >
                        {item.thumbnailDataUrl ? (
                          <img
                            key={`${selectedSessionId ?? "none"}-${item.id}-thumbnail`}
                            src={item.thumbnailDataUrl}
                            alt=""
                          />
                        ) : null}
                        <IconLabel
                          icon={item.manualCheckpoint ? BookmarkPlusIcon : BellIcon}
                          label={formatDuration(item.workedOffsetSeconds)}
                          size={14}
                          className="checkpoint-chip__meta"
                        />
                      </motion.button>
                    ))}
                  </motion.div>
                  {recordingMarkers.length > 0 && recording ? (
                    <div className="recording-list">
                      {recordingMarkers.map((marker, index) => (
                        <div key={`${marker.checkpointId}-${marker.offsetMs}-${index}`}>
                          {formatDurationFromMs(marker.offsetMs)} - {checkpointsById.get(marker.checkpointId)?.noteText?.trim() || "checkpoint switch"}
                        </div>
                      ))}
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
                    <div className="empty-state">
                      {voiceOverPreviewPreparing ? "Preparing voice-over..." : "Preview voice-over to prepare playback."}
                    </div>
                  )}
                  <div className="trim-stats">
                    <div><span>Duration</span><strong>{formatDurationFromMs(audioDurationMs)}</strong></div>
                    <div><span>Playhead</span><strong>{formatDurationFromMs(audioCurrentTimeMs)}</strong></div>
                  </div>
                  <div className="button-row">
                    <button
                      type="button"
                      className="button button--ghost"
                      disabled={busy || recording || voiceOverPreviewPreparing}
                      onClick={onPreviewVoiceOver}
                    >
                      <IconLabel icon={EyeIcon} label={voiceOverPreviewPreparing ? "Preparing voice-over..." : "Preview voice-over"} />
                    </button>
                  </div>
                </>
              ) : (
                <div className="empty-state">No recorded voice-over yet.</div>
              )}
            </section>

            <section className="panel">
              <div className="panel__header">
                <h2>Appendix</h2>
                <span className="badge">{appendixVideo ? "attached" : "optional"}</span>
              </div>
              <div className="button-row">
                <button
                  type="button"
                  className="button"
                  disabled={busy || recording || appendixImportJob?.status === "running"}
                  onClick={onImportAppendix}
                >
                  <IconLabel icon={FolderOpenIcon} label="Import appendix" />
                </button>
                {appendixVideo ? (
                  <button
                    type="button"
                    className="button button--ghost"
                    disabled={busy || recording || appendixImportJob?.status === "running"}
                    onClick={onRemoveAppendix}
                  >
                    <IconLabel icon={XIcon} label="Remove appendix" />
                  </button>
                ) : null}
              </div>
              {appendixImportJob ? (
                <div className="media-import-status">
                  <div className="progress">
                    <div
                      className="progress__bar"
                      style={{ width: `${Math.round(appendixImportJob.progressRatio * 100)}%` }}
                    />
                  </div>
                  <div className="media-import-status__copy">
                    <strong>{appendixImportJob.message}</strong>
                    {appendixImportJob.errorMessage ? <span>{appendixImportJob.errorMessage}</span> : null}
                  </div>
                </div>
              ) : null}
              {appendixVideo ? (
                <div className="media-summary">
                  <strong>{getFileName(appendixVideo.filePath)}</strong>
                  <span>{appendixVideo.durationMs ? formatDurationFromMs(appendixVideo.durationMs) : "Duration unavailable"}</span>
                </div>
              ) : (
                <div className="empty-state">No appendix clip.</div>
              )}
            </section>

            <section className="panel">
              <div className="panel__header">
                <h2>Export</h2>
                <span className="badge">{activeExportJob?.status ?? "idle"}</span>
              </div>
              <div className="empty-state">
                {composition?.outputFilePath ?? "No export destination selected."}
              </div>
              <div className="button-row">
                <button
                  type="button"
                  className="button button--ghost"
                  disabled={busy || recording}
                  onClick={onChooseOutputPath}
                >
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
                  <motion.div
                    key={activeExportJob.id}
                    initial={motionEnabled ? { opacity: 0, y: 8 } : false}
                    animate={motionEnabled ? { opacity: 1, y: 0 } : undefined}
                    exit={motionEnabled ? { opacity: 0, y: -6 } : undefined}
                    transition={motionEnabled ? FAST_TRANSITION : undefined}
                  >
                    <div className="progress progress--animated">
                      <motion.div
                        className="progress__bar"
                        animate={motionEnabled ? { width: `${Math.round(activeExportJob.progressRatio * 100)}%` } : undefined}
                        transition={motionEnabled ? EMPHATIC_TRANSITION : undefined}
                        style={motionEnabled ? undefined : { width: `${Math.round(activeExportJob.progressRatio * 100)}%` }}
                      />
                    </div>
                    <motion.div
                      className="empty-state"
                      key={`${activeExportJob.status}-${activeExportJob.message}`}
                      initial={motionEnabled ? { opacity: 0, y: 8 } : false}
                      animate={motionEnabled ? { opacity: 1, y: 0 } : undefined}
                      exit={motionEnabled ? { opacity: 0, y: -6 } : undefined}
                      transition={motionEnabled ? FAST_TRANSITION : undefined}
                    >
                      {activeExportJob.message}
                    </motion.div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="export-idle"
                    className="empty-state"
                    initial={motionEnabled ? { opacity: 0, y: 8 } : false}
                    animate={motionEnabled ? { opacity: 1, y: 0 } : undefined}
                    exit={motionEnabled ? { opacity: 0, y: -6 } : undefined}
                    transition={motionEnabled ? FAST_TRANSITION : undefined}
                  >
                    No export running.
                  </motion.div>
                )}
              </AnimatePresence>
              <div className="button-row">
                <button
                  type="button"
                  className="button"
                  disabled={busy || recording || pendingRecovery || pendingCheckpoint}
                  onClick={onBuildExport}
                >
                  <IconLabel icon={MonitorCheckIcon} label="Build MP4" />
                </button>
                <button
                  type="button"
                  className="button button--ghost"
                  disabled={busy || activeExportJob?.status !== "running"}
                  onClick={onCancelExport}
                >
                  <IconLabel icon={XIcon} label="Cancel export" />
                </button>
                <button
                  type="button"
                  className="button button--ghost"
                  disabled={busy || recording}
                  onClick={onRetryBuild}
                >
                  <IconLabel icon={RotateCwIcon} label="Retry build" />
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
          {workspaceLoading && !selectedCheckpoint && !previewCheckpoint ? (
            <div className="empty-state">{loadingMessage}</div>
          ) : audioPreviewActive && previewCheckpoint ? (
            <>
              <div className="stats">
                <div><span>Checkpoint</span><strong>{previewCheckpoint.manualCheckpoint ? "Manual" : "Reminder"}</strong></div>
                <div><span>Worked offset</span><strong>{formatDuration(previewCheckpoint.workedOffsetSeconds)}</strong></div>
                <div><span>Playhead</span><strong>{formatDurationFromMs(playheadMs)}</strong></div>
              </div>
              <PreviewFrame
                checkpoint={previewCheckpoint}
                fallbackSrc={previewCheckpointThumbnailUrl}
                fullSrc={previewCheckpointPreviewUrl}
                alt="Preview checkpoint"
              />
              <div className="empty-state">
                {inspectorPreviewNote} at {formatDurationFromMs(playheadMs)}
              </div>
            </>
          ) : inspectorCheckpoint ? (
            <>
              <div className="stats">
                <div><span>Checkpoint</span><strong>{inspectorCheckpoint.manualCheckpoint ? "Manual" : "Reminder"}</strong></div>
                <div><span>Worked offset</span><strong>{formatDuration(inspectorCheckpoint.workedOffsetSeconds)}</strong></div>
                <div><span>Status</span><strong>{inspectorCheckpoint.status}</strong></div>
              </div>
              <PreviewFrame
                checkpoint={inspectorCheckpoint}
                fallbackSrc={inspectorCheckpointThumbnailUrl}
                fullSrc={inspectorCheckpointPreviewUrl}
                alt="Selected checkpoint"
              />
              {inspectorCheckpoint.status === "completed" ? (
                <>
                  <label className="field">
                    <span>Checkpoint note</span>
                    <textarea
                      rows={5}
                      value={inspectorNoteText}
                      onChange={(event) => onInspectorNoteChange(event.target.value)}
                    />
                  </label>
                  <div className="button-row">
                    <button
                      type="button"
                      className="button"
                      disabled={busy || inspectorNoteText.trim().length === 0}
                      onClick={onSaveCheckpointNote}
                    >
                      <IconLabel icon={CheckIcon} label="Save note" />
                    </button>
                  </div>
                </>
              ) : (
                <div className="empty-state">
                  {inspectorCheckpoint.noteText?.trim() || "No saved note for this checkpoint yet."}
                </div>
              )}
              {selectedSegment && composition ? (
                <>
                  <label className="field">
                    <span>Segment checkpoint</span>
                    <select
                      value={selectedSegment.checkpointId}
                      onChange={(event) => onAssignSegmentCheckpoint(event.target.value)}
                    >
                      {availableCheckpoints.map((item) => (
                        <option key={item.id} value={item.id}>
                          {formatDuration(item.workedOffsetSeconds)} {item.manualCheckpoint ? "manual" : "reminder"}
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
            </>
          ) : selectedSegment && composition ? (
            <div className="stats">
              <div><span>Start</span><strong>{formatDurationFromMs(selectedSegment.startOffsetMs)}</strong></div>
              <div><span>End</span><strong>{formatDurationFromMs(selectedSegment.endOffsetMs)}</strong></div>
              <div><span>Duration</span><strong>{formatDurationFromMs(selectedSegment.endOffsetMs - selectedSegment.startOffsetMs)}</strong></div>
            </div>
          ) : previewCheckpoint ? (
            <>
              <PreviewFrame
                checkpoint={previewCheckpoint}
                fallbackSrc={previewCheckpointThumbnailUrl}
                fullSrc={previewCheckpointPreviewUrl}
                alt="Preview checkpoint"
              />
              <div className="empty-state">
                {previewCheckpoint?.noteText?.trim() || "No note"} at {formatDurationFromMs(playheadMs)}
              </div>
            </>
          ) : (
            <div className="empty-state">Select a segment or move the playhead to preview a checkpoint.</div>
          )}
        </section>
      </aside>
    </div>
  );
}
