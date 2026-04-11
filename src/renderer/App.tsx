import { AnimatePresence, LayoutGroup, MotionConfig, motion } from "motion/react";
import { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  AnimatedIconProvider,
  type AnimatedIconComponent,
  BellIcon,
  BookmarkPlusIcon,
  ClockIcon,
  GalleryIcon,
  IconLabel,
  PauseIcon,
  PulseIcon,
  PlayIcon,
  SettingsIcon,
  TrashIcon,
  XIcon
} from "./components/animated-icons";
import { ComposeView } from "./components/ComposeView";
import { PendingCheckpointEditor } from "./components/PendingCheckpointEditor";
import { ReflectView } from "./components/ReflectView";
import { RecoveryBanner } from "./components/RecoveryBanner";
import { ReminderBanner } from "./components/ReminderBanner";
import { SettingsView } from "./components/SettingsView";
import { TrackView } from "./components/TrackView";
import { ToastStack, type ToastMessage, type ToastTone } from "./components/ToastStack";
import { useRetroFeedback } from "./hooks/useRetroFeedback";
import { useSessionWorkspace } from "./hooks/useSessionWorkspace";
import {
  DIALOG_VARIANTS,
  OVERLAY_VARIANTS,
  SPRING_TRANSITION,
  SURFACE_VARIANTS,
  VIEW_VARIANTS
} from "./motion";
import type {
  AppState,
  ExportCompositionSummary,
  ImportedMediaAssetSummary,
  ReflectQuery,
  ReflectRangePreset,
  ReflectSummary,
  SessionHistoryPage,
  SessionHistoryStatusFilter,
  SessionSummary,
  UpdateSettingsInput,
} from "../shared/contracts";
import {
  buildSegmentsFromMarkers,
  clamp,
  formatDuration,
  getEffectiveVoiceOverDurationMs,
  getPreviewSegment,
  getWorkedSecondsForDisplay,
  normalizeCompositionDuration,
  RecordingMarker,
  type VisualSourceSelection,
  resizeBoundary,
  sortSegments
} from "./utils";

type ViewMode = "track" | "compose" | "reflect" | "settings";
type DragState = { segmentId: string; edge: "start" | "end" } | null;
type PreviewSelectionState = {
  sessionId: string | null;
  armedVisualSource: VisualSourceSelection | null;
  selectedCheckpointId: string | null;
  selectedImportId: string | null;
  selectedSegmentId: string | null;
};

function createToastId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}
const APP_ICON_SRC = "/icons/sessiontrail-app-icon.png";
const HISTORY_PAGE_SIZE = 12;
const VIEW_TABS: Array<{ mode: ViewMode; label: string; icon: AnimatedIconComponent }> = [
  { mode: "track", label: "Track", icon: ClockIcon },
  { mode: "compose", label: "Compose", icon: GalleryIcon },
  { mode: "reflect", label: "Reflect", icon: PulseIcon },
  { mode: "settings", label: "Settings", icon: SettingsIcon }
];

const placeholderState: AppState = {
  appName: "SessionTrail",
  version: "0.0.0",
  platform: "win32",
  bootedAt: new Date(0).toISOString(),
  status: "booting",
  trayReady: false,
  dashboardVisibility: "hidden",
  dashboardFullscreen: false,
  activeSession: null,
  recentSessions: [],
  pendingRecovery: null,
  pendingReminderPrompt: null,
  pendingCheckpoint: null,
  activeExportJob: null,
  activeMediaImportJob: null,
  resumeNotice: null,
  settings: {
    reminderIntervalMinutes: 10,
    defaultTargetMinutes: 120,
    launchAtLogin: false,
    captureDelaySeconds: 2,
    reminderSnoozeMinutes: 1,
    reflectDailyGoalMinutes: 480,
    startupDashboardBehavior: "tray_only",
    openDashboardOnReminder: false,
    defaultExportDirectory: "",
    uiSoundsEnabled: true,
    uiMotionEnabled: true,
    snailPetEnabled: false,
    snailPetScale: 3,
    snailPetSpeed: "normal",
    theme: "clean"
  },
  snailPet: {
    visible: false,
    paused: false,
    behaviorState: null
  },
  lastErrorMessage: null
};

export function App() {
  const [state, setState] = useState<AppState>(placeholderState);
  const [viewMode, setViewMode] = useState<ViewMode>("track");
  const [cancelDialogSessionId, setCancelDialogSessionId] = useState<string | null>(null);
  const [sessionTitle, setSessionTitle] = useState("");
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [audioPreviewActive, setAudioPreviewActive] = useState(false);
  const [recordingMarkers, setRecordingMarkers] = useState<RecordingMarker[]>([]);
  const [recording, setRecording] = useState(false);
  const [dragState, setDragState] = useState<DragState>(null);
  const [checkpointNoteText, setCheckpointNoteText] = useState("");
  const [inspectorNoteText, setInspectorNoteText] = useState("");
  const [settingsDraft, setSettingsDraft] = useState<UpdateSettingsInput>({
    reminderIntervalMinutes: 10,
    defaultTargetMinutes: 120,
    launchAtLogin: false,
    captureDelaySeconds: 2,
    reminderSnoozeMinutes: 1,
    reflectDailyGoalMinutes: 480,
    startupDashboardBehavior: "tray_only",
    openDashboardOnReminder: false,
    defaultExportDirectory: "",
    uiSoundsEnabled: true,
    uiMotionEnabled: true,
    snailPetEnabled: false,
    snailPetScale: 3,
    snailPetSpeed: "normal"
  });
  const [historyQuery, setHistoryQuery] = useState("");
  const deferredHistoryQuery = useDeferredValue(historyQuery);
  const [historyStatus, setHistoryStatus] = useState<SessionHistoryStatusFilter>("all");
  const [historyOffset, setHistoryOffset] = useState(0);
  const [historyPage, setHistoryPage] = useState<SessionHistoryPage>({
    items: [],
    total: 0,
    limit: HISTORY_PAGE_SIZE,
    offset: 0
  });
  const [reflectPreset, setReflectPreset] = useState<ReflectRangePreset>("this_week");
  const [reflectPeriodOffset, setReflectPeriodOffset] = useState(0);
  const [reflectSummary, setReflectSummary] = useState<ReflectSummary | null>(null);
  const [reflectLoading, setReflectLoading] = useState(false);
  const [selectedReflectSessionId, setSelectedReflectSessionId] = useState<string | null>(null);
  const [reflectRefreshToken, setReflectRefreshToken] = useState(0);
  const [preparedVoiceOverPreviewUrl, setPreparedVoiceOverPreviewUrl] = useState<string | null>(null);
  const [voiceOverPreviewPreparing, setVoiceOverPreviewPreparing] = useState(false);
  const [currentImportVideoPlaybackMs, setCurrentImportVideoPlaybackMs] = useState(0);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioPreviewFrameRef = useRef<number | null>(null);
  const audioPreviewActiveRef = useRef(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingStartedAtRef = useRef<number | null>(null);
  const recordingSessionIdRef = useRef<string | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingMarkersRef = useRef<RecordingMarker[]>([]);
  const previewSegmentIdRef = useRef<string | null>(null);
  const previewSelectionRestoreRef = useRef<PreviewSelectionState | null>(null);
  const selectedSessionIdRef = useRef<string | null>(null);
  const armedVisualSourceRef = useRef<VisualSourceSelection | null>(null);
  const selectedCheckpointIdRef = useRef<string | null>(null);
  const selectedImportIdRef = useRef<string | null>(null);
  const selectedSegmentIdRef = useRef<string | null>(null);
  const pendingPreparedVoicePreviewPlaybackRef = useRef(false);
  const preparedVoiceOverPreviewUrlRef = useRef<string | null>(null);
  const importVideoPlaybackMsRef = useRef<Record<string, number>>({});
  const importVideoEndedRef = useRef<Record<string, boolean>>({});
  const { motionEnabled, play: playFeedback } = useRetroFeedback(
    state.settings.uiSoundsEnabled,
    state.settings.uiMotionEnabled
  );
  const startupSoundPlayedRef = useRef(false);
  const previousStateRef = useRef<AppState>(placeholderState);
  const {
    timelineItems,
    importedMedia,
    voiceOver,
    setVoiceOver,
    composition,
    setComposition,
    compositionDirty,
    setCompositionDirty,
    selectedSegmentId,
    setSelectedSegmentId,
    selectedCheckpointId,
    setSelectedCheckpointId,
    selectedImportId,
    setSelectedImportId,
    playheadMs,
    setPlayheadMs,
    armedVisualSource,
    setArmedVisualSource,
    audioPreviewDurationMs,
    setAudioPreviewDurationMs,
    audioCurrentTimeMs,
    setAudioCurrentTimeMs,
    workspaceLoading,
    loadedSessionId,
    sessionSwitching,
    checkpointsById,
    importedMediaById,
    selectedSegment,
    selectedCheckpoint,
    selectedImport,
    previewSegment,
    previewCheckpoint,
    previewImport,
    effectiveVoiceDurationMs,
    selectedCheckpointThumbnailUrl,
    selectedCheckpointPreviewUrl,
    previewCheckpointThumbnailUrl,
    previewCheckpointPreviewUrl,
    loadSessionWorkspace
  } = useSessionWorkspace(selectedSessionId, state.pendingCheckpoint?.checkpoint.id ?? null);

  const pushToast = (message: string, tone: ToastTone = "error") => {
    setToasts((current) => [...current, { id: createToastId(), message, tone }]);
  };

  const dismissToast = (toastId: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== toastId));
  };

  const runAction = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Unexpected error");
    } finally {
      setBusy(false);
    }
  };

  const runPassiveAction = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Unexpected error");
    }
  };

  useEffect(() => {
    let mounted = true;
    const unsubscribe = window.sessionTrail.app.onStateChanged((nextState) => mounted && setState(nextState));
    void window.sessionTrail.app.getState().then((nextState) => mounted && setState(nextState));
    return () => {
      mounted = false;
      unsubscribe();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    if (viewMode !== "track" && viewMode !== "compose") {
      setNowMs(Date.now());
      return;
    }

    const timer = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => {
      window.clearInterval(timer);
    };
  }, [viewMode]);

  useEffect(() => {
    if (startupSoundPlayedRef.current || state.status === "booting") {
      return;
    }

    startupSoundPlayedRef.current = true;
    playFeedback("app_startup");
  }, [playFeedback, state.status]);

  useEffect(() => {
    const previous = previousStateRef.current;
    if (!previous.activeSession && state.activeSession?.status === "active") {
      playFeedback("session_start");
    } else if (previous.activeSession?.status === "active" && state.activeSession?.status === "paused") {
      playFeedback("session_pause");
    } else if (previous.activeSession?.status === "paused" && state.activeSession?.status === "active") {
      playFeedback("session_resume");
    }

    if (previous.pendingReminderPrompt?.id !== state.pendingReminderPrompt?.id && state.pendingReminderPrompt) {
      playFeedback("reminder");
    }

    if (previous.pendingCheckpoint?.checkpoint.id !== state.pendingCheckpoint?.checkpoint.id && state.pendingCheckpoint) {
      playFeedback("checkpoint_capture");
    }

    if (previous.activeExportJob?.status !== "completed" && state.activeExportJob?.status === "completed") {
      playFeedback("export_complete");
    }

    if (previous.lastErrorMessage !== state.lastErrorMessage && state.lastErrorMessage) {
      playFeedback("error");
    }

    if (previous.activeExportJob?.status !== "failed" && state.activeExportJob?.status === "failed") {
      playFeedback("error");
    }

    previousStateRef.current = state;
  }, [playFeedback, state]);

  useEffect(() => {
    if (!state.lastErrorMessage) {
      return;
    }

    pushToast(state.lastErrorMessage);
    void window.sessionTrail.app.clearLastError();
  }, [state.lastErrorMessage]);

  useEffect(() => {
    if (state.activeExportJob?.status === "failed" && state.activeExportJob.errorMessage) {
      pushToast(state.activeExportJob.errorMessage);
    }
  }, [state.activeExportJob?.errorMessage, state.activeExportJob?.status]);

  useEffect(() => {
    setCheckpointNoteText(state.pendingCheckpoint?.checkpoint.noteText ?? "");
  }, [state.pendingCheckpoint?.checkpoint.id, state.pendingCheckpoint?.checkpoint.noteText]);

  useEffect(() => {
    setSettingsDraft({
      reminderIntervalMinutes: state.settings.reminderIntervalMinutes,
      defaultTargetMinutes: state.settings.defaultTargetMinutes,
      launchAtLogin: state.settings.launchAtLogin,
      captureDelaySeconds: state.settings.captureDelaySeconds,
      reminderSnoozeMinutes: state.settings.reminderSnoozeMinutes,
      reflectDailyGoalMinutes: state.settings.reflectDailyGoalMinutes,
      startupDashboardBehavior: state.settings.startupDashboardBehavior,
      openDashboardOnReminder: state.settings.openDashboardOnReminder,
      defaultExportDirectory: state.settings.defaultExportDirectory,
      uiSoundsEnabled: state.settings.uiSoundsEnabled,
      uiMotionEnabled: state.settings.uiMotionEnabled,
      snailPetEnabled: state.settings.snailPetEnabled,
      snailPetScale: state.settings.snailPetScale,
      snailPetSpeed: state.settings.snailPetSpeed
    });
  }, [state.settings]);

  useEffect(() => {
    setHistoryOffset(0);
  }, [deferredHistoryQuery, historyStatus]);

  const reflectQuery = useMemo<ReflectQuery>(
    () => ({
      preset: reflectPreset,
      periodOffset: reflectPeriodOffset
    }),
    [reflectPeriodOffset, reflectPreset]
  );

  useEffect(() => {
    let cancelled = false;
    void window.sessionTrail.session.listHistory({
      query: deferredHistoryQuery.trim() || undefined,
      status: historyStatus,
      limit: HISTORY_PAGE_SIZE,
      offset: historyOffset
    }).then((page) => {
      if (!cancelled) {
        startTransition(() => setHistoryPage(page));
      }
    }).catch((error) => {
      if (!cancelled) {
        pushToast(error instanceof Error ? error.message : "Failed to load session history");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [deferredHistoryQuery, historyOffset, historyStatus]);

  useEffect(() => {
    if (viewMode !== "reflect") {
      return;
    }

    let cancelled = false;
    setReflectLoading(true);
    void window.sessionTrail.reflect
      .getSummary(reflectQuery)
      .then((summary) => {
        if (cancelled) {
          return;
        }

        startTransition(() => {
          setReflectSummary(summary);
          setSelectedReflectSessionId((current) =>
            current && summary.sessions.some((session) => session.sessionId === current)
              ? current
              : summary.sessions[0]?.sessionId ?? null
          );
        });
      })
      .catch((error) => {
        if (!cancelled) {
          pushToast(error instanceof Error ? error.message : "Failed to load reflect data");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setReflectLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [reflectQuery, reflectRefreshToken, viewMode]);

  useEffect(() => {
    const sessions = [
      state.activeSession,
      ...state.recentSessions,
      ...historyPage.items
    ].filter(Boolean) as SessionSummary[];
    const unique = new Map(sessions.map((session) => [session.id, session]));
    const preferred = state.activeSession?.id ?? [...unique.values()][0]?.id ?? null;
    setSelectedSessionId((current) => (current && unique.has(current) ? current : preferred));
  }, [historyPage.items, state.activeSession, state.recentSessions]);

  const sessions = useMemo(() => {
    const ordered = [
      state.activeSession,
      ...state.recentSessions.filter((session) => session.id !== state.activeSession?.id),
      ...historyPage.items
    ].filter(Boolean) as SessionSummary[];
    const byId = new Map<string, SessionSummary>();
    for (const session of ordered) {
      byId.set(session.id, session);
    }
    return [...byId.values()];
  }, [historyPage.items, state.activeSession, state.recentSessions]);
  const activeSession = state.activeSession;
  const selectedSession = sessions.find((session) => session.id === selectedSessionId) ?? null;
  const workedSeconds = getWorkedSecondsForDisplay(activeSession, nowMs);
  const controlsBlocked = Boolean(state.pendingRecovery || state.pendingReminderPrompt || state.pendingCheckpoint);
  const canCheckpoint = Boolean(selectedSession && (selectedSession.status === "active" || selectedSession.status === "paused") && !controlsBlocked);
  const recordingElapsedMs = recording && recordingStartedAtRef.current ? Math.max(0, nowMs - recordingStartedAtRef.current) : 0;
  const showReminderBanner = Boolean(state.pendingReminderPrompt && viewMode !== "settings");
  const cancelDialogSession =
    cancelDialogSessionId && activeSession?.id === cancelDialogSessionId ? activeSession : null;
  const appShellClassName = `app-shell app-shell--scroll-hidden${
    viewMode === "compose" ? " app-shell--compose" : ""
  }${motionEnabled ? " app-shell--motion" : ""}`;
  const headerStatus = activeSession?.status ?? "idle";
  const HeaderStatusIcon = headerStatus === "active" ? PlayIcon : headerStatus === "paused" ? PauseIcon : ClockIcon;
  const headerSessionTitle = activeSession?.title ?? "No active session";
  const activePreviewSource = audioPreviewActive && previewSegment
    ? { sourceKind: previewSegment.sourceKind, sourceId: previewSegment.sourceId }
    : null;
  const activeVisualSource = activePreviewSource ?? armedVisualSource;
  const activeCheckpointId = activeVisualSource?.sourceKind === "checkpoint" ? activeVisualSource.sourceId : null;
  const activeImportId = activeVisualSource?.sourceKind !== "checkpoint" ? activeVisualSource?.sourceId ?? null : null;

  useEffect(() => {
    selectedSessionIdRef.current = selectedSessionId;
  }, [selectedSessionId]);

  useEffect(() => {
    armedVisualSourceRef.current = armedVisualSource;
  }, [armedVisualSource]);

  useEffect(() => {
    selectedCheckpointIdRef.current = selectedCheckpointId;
  }, [selectedCheckpointId]);

  useEffect(() => {
    selectedImportIdRef.current = selectedImportId;
  }, [selectedImportId]);

  useEffect(() => {
    const trackedImportId = audioPreviewActive
      ? previewImport?.id ?? null
      : selectedImportId;
    setCurrentImportVideoPlaybackMs(
      trackedImportId ? Math.max(0, importVideoPlaybackMsRef.current[trackedImportId] ?? 0) : 0
    );
  }, [audioPreviewActive, previewImport?.id, selectedImportId]);

  useEffect(() => {
    selectedSegmentIdRef.current = selectedSegmentId;
  }, [selectedSegmentId]);

  const restorePreviewSelection = (currentSessionId: string | null) => {
    const selection = previewSelectionRestoreRef.current;
    if (!selection) {
      return;
    }

    previewSegmentIdRef.current = null;
    previewSelectionRestoreRef.current = null;
    if (selection.sessionId !== currentSessionId) {
      return;
    }

    setArmedVisualSource(selection.armedVisualSource);
    setSelectedCheckpointId(selection.selectedCheckpointId);
    setSelectedImportId(selection.selectedImportId);
    setSelectedSegmentId(selection.selectedSegmentId);
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    const syncPreviewState = () => {
      const currentTimeMs = Math.max(0, Math.round(audio.currentTime * 1000));
      const maxPreviewMs = composition?.durationMs ?? Math.max(0, effectiveVoiceDurationMs ?? 0);
      setAudioCurrentTimeMs(currentTimeMs);
      const nextPlayheadMs = clamp(currentTimeMs, 0, maxPreviewMs);
      setPlayheadMs(nextPlayheadMs);

      if (!audioPreviewActiveRef.current) {
        return;
      }

      const nextPreviewSegment = getPreviewSegment(composition?.segments ?? [], nextPlayheadMs);
      const nextPreviewSegmentId = nextPreviewSegment?.id ?? null;
      if (nextPreviewSegmentId === previewSegmentIdRef.current) {
        return;
      }

      previewSegmentIdRef.current = nextPreviewSegmentId;
      if (nextPreviewSegment) {
        setSelectedSegmentId(nextPreviewSegment.id);
        if (nextPreviewSegment.sourceKind === "checkpoint") {
          setSelectedCheckpointId(nextPreviewSegment.sourceId);
          setSelectedImportId(null);
        } else {
          setSelectedImportId(nextPreviewSegment.sourceId);
          setSelectedCheckpointId(null);
        }
      }
    };

    const stopFrameLoop = () => {
      if (audioPreviewFrameRef.current !== null) {
        cancelAnimationFrame(audioPreviewFrameRef.current);
        audioPreviewFrameRef.current = null;
      }
    };

    const tick = () => {
      syncPreviewState();
      if (!audio.paused && !audio.ended) {
        audioPreviewFrameRef.current = requestAnimationFrame(tick);
      } else {
        stopFrameLoop();
      }
    };

    const handlePlay = () => {
      if (!previewSelectionRestoreRef.current) {
        previewSelectionRestoreRef.current = {
          sessionId: selectedSessionIdRef.current,
          armedVisualSource: armedVisualSourceRef.current,
          selectedCheckpointId: selectedCheckpointIdRef.current,
          selectedImportId: selectedImportIdRef.current,
          selectedSegmentId: selectedSegmentIdRef.current
        };
      }
      previewSegmentIdRef.current = null;
      audioPreviewActiveRef.current = true;
      setAudioPreviewActive(true);
      stopFrameLoop();
      syncPreviewState();
      audioPreviewFrameRef.current = requestAnimationFrame(tick);
    };

    const handlePause = () => {
      stopFrameLoop();
      syncPreviewState();
      audioPreviewActiveRef.current = false;
      setAudioPreviewActive(false);
      restorePreviewSelection(selectedSessionIdRef.current);
    };

    const handleSeeked = () => {
      syncPreviewState();
    };

    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handlePause);
    audio.addEventListener("seeked", handleSeeked);

    return () => {
      stopFrameLoop();
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handlePause);
      audio.removeEventListener("seeked", handleSeeked);
    };
  }, [composition, effectiveVoiceDurationMs, preparedVoiceOverPreviewUrl, setAudioCurrentTimeMs, setPlayheadMs]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    audioPreviewActiveRef.current = false;
    setAudioPreviewActive(false);
    if (audioPreviewFrameRef.current !== null) {
      cancelAnimationFrame(audioPreviewFrameRef.current);
      audioPreviewFrameRef.current = null;
    }
    previewSegmentIdRef.current = null;
    pendingPreparedVoicePreviewPlaybackRef.current = false;
    setAudioCurrentTimeMs(0);
    setPlayheadMs(0);
    restorePreviewSelection(selectedSessionId);
    if (preparedVoiceOverPreviewUrlRef.current) {
      URL.revokeObjectURL(preparedVoiceOverPreviewUrlRef.current);
      preparedVoiceOverPreviewUrlRef.current = null;
    }
    setPreparedVoiceOverPreviewUrl(null);
    setVoiceOverPreviewPreparing(false);
  }, [selectedSessionId, voiceOver?.id]);

  useEffect(() => {
    return () => {
      if (preparedVoiceOverPreviewUrlRef.current) {
        URL.revokeObjectURL(preparedVoiceOverPreviewUrlRef.current);
        preparedVoiceOverPreviewUrlRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!preparedVoiceOverPreviewUrl || !pendingPreparedVoicePreviewPlaybackRef.current) {
      return;
    }

    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    let canceled = false;
    const startPlayback = async () => {
      if (canceled) {
        return;
      }

      try {
        audio.pause();
        audio.currentTime = 0;
        setAudioCurrentTimeMs(0);
        setPlayheadMs(0);
        await audio.play();
      } catch (error) {
        if (!canceled) {
          pushToast(error instanceof Error ? error.message : "Unable to play the prepared voice-over preview.");
        }
      } finally {
        if (!canceled) {
          pendingPreparedVoicePreviewPlaybackRef.current = false;
        }
      }
    };

    const onLoadedMetadata = () => {
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      void startPlayback();
    };

    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      void startPlayback();
      return;
    }

    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.load();

    return () => {
      canceled = true;
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
    };
  }, [preparedVoiceOverPreviewUrl, setAudioCurrentTimeMs, setPlayheadMs]);

  useEffect(() => {
    if (!dragState || !composition) {
      return;
    }

    const onMove = (event: MouseEvent) => {
      const track = trackRef.current;
      if (!track || !composition.durationMs) {
        return;
      }

      const rect = track.getBoundingClientRect();
      const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
      setComposition((current) =>
        current
          ? normalizeCompositionDuration(
              resizeBoundary(current, dragState.segmentId, dragState.edge, Math.round(ratio * current.durationMs)),
              effectiveVoiceDurationMs
            )
          : current
      );
      setCompositionDirty(true);
    };

    const onUp = () => setDragState(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [composition, dragState, effectiveVoiceDurationMs]);

  useEffect(() => {
    setInspectorNoteText(selectedCheckpoint?.noteText ?? "");
  }, [selectedCheckpoint?.id, selectedCheckpoint?.noteText]);

  useEffect(() => {
    if (
      cancelDialogSessionId &&
      (!activeSession ||
        activeSession.id !== cancelDialogSessionId ||
        (activeSession.status !== "active" && activeSession.status !== "paused"))
    ) {
      setCancelDialogSessionId(null);
    }
  }, [activeSession, cancelDialogSessionId]);

  const buildSaveCompositionInput = (
    baseComposition: ExportCompositionSummary,
    overrides: Partial<Pick<ExportCompositionSummary, "voiceOverAssetId" | "outputFilePath" | "durationMs">> = {}
  ) => ({
    sessionId: baseComposition.sessionId,
    voiceOverAssetId: Object.prototype.hasOwnProperty.call(overrides, "voiceOverAssetId")
      ? overrides.voiceOverAssetId ?? null
      : baseComposition.voiceOverAssetId,
    outputFilePath: Object.prototype.hasOwnProperty.call(overrides, "outputFilePath")
      ? overrides.outputFilePath ?? null
      : baseComposition.outputFilePath,
    durationMs: Object.prototype.hasOwnProperty.call(overrides, "durationMs")
      ? overrides.durationMs ?? baseComposition.durationMs
      : baseComposition.durationMs,
    segments: sortSegments(baseComposition.segments).map((segment, index) => ({
      id: segment.id,
      sourceKind: segment.sourceKind,
      sourceId: segment.sourceId,
      startOffsetMs: segment.startOffsetMs,
      endOffsetMs: segment.endOffsetMs,
      mediaStartOffsetMs: segment.mediaStartOffsetMs,
      sortOrder: index,
      source: segment.source
    }))
  });

  const saveComposition = async () => {
    if (!composition) {
      return;
    }

    const normalizedComposition = normalizeCompositionDuration(composition, effectiveVoiceDurationMs);
    const saved = await window.sessionTrail.export.saveComposition(buildSaveCompositionInput(normalizedComposition));

    setComposition(normalizeCompositionDuration(saved, effectiveVoiceDurationMs));
    setCompositionDirty(false);
  };

  const prepareVoiceOverPreview = async () => {
    if (!voiceOver) {
      return null;
    }

    setVoiceOverPreviewPreparing(true);
    try {
      const preview = await window.sessionTrail.audio.getPreparedPreview(voiceOver.id);
      const previewBlob = new Blob([preview.buffer], { type: preview.mimeType });
      const previewUrl = URL.createObjectURL(previewBlob);
      if (preparedVoiceOverPreviewUrlRef.current) {
        URL.revokeObjectURL(preparedVoiceOverPreviewUrlRef.current);
      }
      preparedVoiceOverPreviewUrlRef.current = previewUrl;
      setPreparedVoiceOverPreviewUrl(previewUrl);
      return previewUrl;
    } catch (error) {
      pendingPreparedVoicePreviewPlaybackRef.current = false;
      throw error;
    } finally {
      setVoiceOverPreviewPreparing(false);
    }
  };

  const refreshHistoryPage = async () => {
    const page = await window.sessionTrail.session.listHistory({
      query: deferredHistoryQuery.trim() || undefined,
      status: historyStatus,
      limit: HISTORY_PAGE_SIZE,
      offset: historyOffset
    });
    startTransition(() => setHistoryPage(page));
  };

  const getImportSourceKind = (asset: ImportedMediaAssetSummary): VisualSourceSelection["sourceKind"] =>
    asset.kind === "image" ? "imported_image" : "imported_video";

  const getMediaStartOffsetMs = (selection: VisualSourceSelection): number => {
    if (selection.sourceKind !== "imported_video") {
      return 0;
    }

    if (importVideoEndedRef.current[selection.sourceId]) {
      return 0;
    }

    return Math.max(0, importVideoPlaybackMsRef.current[selection.sourceId] ?? 0);
  };

  const handleImportVideoPlaybackUpdate = (assetId: string, timeMs: number, ended: boolean) => {
    importVideoPlaybackMsRef.current[assetId] = Math.max(0, timeMs);
    importVideoEndedRef.current[assetId] = ended;
    if ((audioPreviewActive ? previewImport?.id : selectedImportId) === assetId) {
      setCurrentImportVideoPlaybackMs(Math.max(0, timeMs));
    }
  };

  const startRecording = async () => {
    if (!selectedSessionId) {
      throw new Error("Select a session before recording.");
    }

    const fallbackCheckpoint = timelineItems.find((item) => item.status === "completed");
    const fallbackImport = importedMedia[0];
    const firstSource =
      armedVisualSource ??
      (fallbackCheckpoint ? { sourceKind: "checkpoint" as const, sourceId: fallbackCheckpoint.id } : null) ??
      (fallbackImport ? { sourceKind: getImportSourceKind(fallbackImport), sourceId: fallbackImport.id } : null);
    if (!firstSource) {
      throw new Error("Add at least one checkpoint or imported visual before recording.");
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const preferredMimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
    const recorder = new MediaRecorder(stream, MediaRecorder.isTypeSupported(preferredMimeType) ? { mimeType: preferredMimeType } : undefined);

    recorderRef.current = recorder;
    streamRef.current = stream;
    recordingStartedAtRef.current = Date.now();
    recordingSessionIdRef.current = selectedSessionId;
    recordingChunksRef.current = [];
    recordingMarkersRef.current = [{
      ...firstSource,
      offsetMs: 0,
      mediaStartOffsetMs: getMediaStartOffsetMs(firstSource)
    }];
    setRecordingMarkers([...recordingMarkersRef.current]);
    setRecording(true);
    recorder.ondataavailable = (event) => event.data.size > 0 && recordingChunksRef.current.push(event.data);
    recorder.onstop = () => {
      const sessionId = recordingSessionIdRef.current;
      const startedAt = recordingStartedAtRef.current;
      const durationMs = startedAt ? Math.max(500, Date.now() - startedAt) : 500;
      const markers = [...recordingMarkersRef.current];
      const chunks = [...recordingChunksRef.current];

      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      recorderRef.current = null;
      recordingStartedAtRef.current = null;
      recordingSessionIdRef.current = null;
      recordingChunksRef.current = [];
      recordingMarkersRef.current = [];
      setRecording(false);

      if (!sessionId || chunks.length === 0) {
        return;
      }

      void runAction(async () => {
        const mimeType = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunks, { type: mimeType });
        const voice = await window.sessionTrail.audio.saveRecording({
          sessionId,
          mimeType,
          buffer: await blob.arrayBuffer()
        });
        const baseComposition = composition ?? await window.sessionTrail.export.getComposition(sessionId);
        const saved = await window.sessionTrail.export.saveComposition({
          ...buildSaveCompositionInput(baseComposition, {
            voiceOverAssetId: voice.id,
            durationMs
          }),
          durationMs,
          segments: buildSegmentsFromMarkers(durationMs, markers)
        });
        setVoiceOver(voice);
        setComposition(normalizeCompositionDuration(saved, getEffectiveVoiceOverDurationMs(voice)));
        setCompositionDirty(false);
        setSelectedSegmentId(saved.segments[0]?.id ?? null);
        if (saved.segments[0]?.sourceKind === "checkpoint") {
          setSelectedCheckpointId(saved.segments[0].sourceId);
          setSelectedImportId(null);
        } else {
          setSelectedImportId(saved.segments[0]?.sourceId ?? null);
          setSelectedCheckpointId(null);
        }
      });
    };
    recorder.start();
  };

  const stopRecording = () => recorderRef.current && recorderRef.current.state !== "inactive" && recorderRef.current.stop();

  const markVisualSource = (selection: VisualSourceSelection) => {
    if (selection.sourceKind === "imported_video" && importVideoEndedRef.current[selection.sourceId]) {
      importVideoEndedRef.current[selection.sourceId] = false;
      importVideoPlaybackMsRef.current[selection.sourceId] = 0;
      setCurrentImportVideoPlaybackMs(0);
    }
    setArmedVisualSource(selection);
    if (selection.sourceKind === "checkpoint") {
      setSelectedCheckpointId(selection.sourceId);
      setSelectedImportId(null);
    } else {
      setSelectedImportId(selection.sourceId);
      setSelectedCheckpointId(null);
    }
    if (!recording || !recordingStartedAtRef.current) {
      return;
    }

    const lastMarker = recordingMarkersRef.current.at(-1);
    const nextMediaStartOffsetMs = getMediaStartOffsetMs(selection);
    if (
      lastMarker?.sourceKind === selection.sourceKind &&
      lastMarker.sourceId === selection.sourceId &&
      lastMarker.mediaStartOffsetMs === nextMediaStartOffsetMs
    ) {
      return;
    }

    const nextMarkers = [
      ...recordingMarkersRef.current,
      {
        ...selection,
        offsetMs: Date.now() - recordingStartedAtRef.current,
        mediaStartOffsetMs: nextMediaStartOffsetMs
      }
    ];
    recordingMarkersRef.current = nextMarkers;
    setRecordingMarkers(nextMarkers);
    setPlayheadMs(nextMarkers.at(-1)?.offsetMs ?? 0);
  };

  const saveSettings = async () => {
    const reminderIntervalMinutes = Number(settingsDraft.reminderIntervalMinutes ?? state.settings.reminderIntervalMinutes);
    const defaultTargetMinutes = Number(settingsDraft.defaultTargetMinutes ?? state.settings.defaultTargetMinutes);
    const captureDelaySeconds = Number(settingsDraft.captureDelaySeconds ?? state.settings.captureDelaySeconds);
    const reminderSnoozeMinutes = Number(settingsDraft.reminderSnoozeMinutes ?? state.settings.reminderSnoozeMinutes);
    const reflectDailyGoalMinutes = Number(
      settingsDraft.reflectDailyGoalMinutes ?? state.settings.reflectDailyGoalMinutes
    );
    if (!Number.isFinite(reminderIntervalMinutes) || reminderIntervalMinutes < 1) {
      throw new Error("Reminder interval must be at least 1 minute.");
    }
    if (!Number.isFinite(defaultTargetMinutes) || defaultTargetMinutes < 1) {
      throw new Error("Default session target must be at least 1 minute.");
    }
    if (!Number.isFinite(captureDelaySeconds) || captureDelaySeconds < 0) {
      throw new Error("Capture delay must be zero or greater.");
    }
    if (!Number.isFinite(reminderSnoozeMinutes) || reminderSnoozeMinutes < 1) {
      throw new Error("Reminder snooze must be at least 1 minute.");
    }
    if (!Number.isFinite(reflectDailyGoalMinutes) || reflectDailyGoalMinutes < 1) {
      throw new Error("Reflect daily goal must be at least 1 minute.");
    }

    await window.sessionTrail.settings.set({
      reminderIntervalMinutes,
      defaultTargetMinutes,
      launchAtLogin: Boolean(settingsDraft.launchAtLogin ?? state.settings.launchAtLogin),
      captureDelaySeconds,
      reminderSnoozeMinutes,
      reflectDailyGoalMinutes,
      startupDashboardBehavior: settingsDraft.startupDashboardBehavior ?? state.settings.startupDashboardBehavior,
      openDashboardOnReminder: Boolean(
        settingsDraft.openDashboardOnReminder ?? state.settings.openDashboardOnReminder
      ),
      defaultExportDirectory:
        (settingsDraft.defaultExportDirectory ?? state.settings.defaultExportDirectory).trim() ||
        state.settings.defaultExportDirectory,
      uiSoundsEnabled: Boolean(settingsDraft.uiSoundsEnabled ?? state.settings.uiSoundsEnabled),
      uiMotionEnabled: Boolean(settingsDraft.uiMotionEnabled ?? state.settings.uiMotionEnabled),
      snailPetEnabled: Boolean(settingsDraft.snailPetEnabled ?? state.settings.snailPetEnabled),
      snailPetScale: settingsDraft.snailPetScale ?? state.settings.snailPetScale,
      snailPetSpeed: settingsDraft.snailPetSpeed ?? state.settings.snailPetSpeed
    });
  };

  const segmentStyles = useMemo(() => {
    if (!composition?.durationMs) {
      return new Map<string, { left: number; width: number }>();
    }

    return new Map(
      sortSegments(composition.segments).map((segment) => [
        segment.id,
        {
          left: (segment.startOffsetMs / composition.durationMs) * 100,
          width: ((segment.endOffsetMs - segment.startOffsetMs) / composition.durationMs) * 100
        }
      ])
    );
  }, [composition]);

  const runExportBuild = async () => {
    if (compositionDirty) {
      await saveComposition();
    }

    if (selectedSession) {
      await window.sessionTrail.export.run({
        sessionId: selectedSession.id
      });
    }
  };

  const renameHistorySession = async (sessionId: string, title: string) => {
    await window.sessionTrail.session.rename({ sessionId, title });
    await refreshHistoryPage();
  };

  const deleteHistorySession = async (sessionId: string) => {
    await window.sessionTrail.session.delete(sessionId);
    if (selectedSessionId === sessionId) {
      setSelectedSessionId(null);
    }

    if (historyPage.items.length === 1 && historyOffset > 0) {
      setHistoryOffset((current) => Math.max(0, current - HISTORY_PAGE_SIZE));
      return;
    }

    await refreshHistoryPage();
  };

  const deleteImportedMedia = async (assetId: string) => {
    await window.sessionTrail.media.deleteImport(assetId);
    if (selectedImportId === assetId) {
      setSelectedImportId(null);
      if (armedVisualSource?.sourceId === assetId) {
        setArmedVisualSource(null);
      }
    }
    await loadSessionWorkspace(selectedSession?.id ?? selectedSessionId ?? null);
  };

  const saveSelectedCheckpointNote = async () => {
    if (!selectedCheckpoint) {
      return;
    }

    await window.sessionTrail.checkpoint.updateNote({
      checkpointId: selectedCheckpoint.id,
      noteText: inspectorNoteText
    });
    playFeedback("checkpoint_save");
    await loadSessionWorkspace(selectedSession?.id ?? null);
  };

  const deleteSelectedCheckpoint = async () => {
    if (!selectedCheckpoint) {
      return;
    }

    await window.sessionTrail.checkpoint.delete(selectedCheckpoint.id);
    await loadSessionWorkspace(selectedSession?.id ?? null);
  };

  const savePendingCheckpoint = async (editedScreenshotBuffer: ArrayBuffer | null) => {
    if (!state.pendingCheckpoint) {
      return;
    }

    if (editedScreenshotBuffer) {
      await window.sessionTrail.checkpoint.replacePendingScreenshot({
        checkpointId: state.pendingCheckpoint.checkpoint.id,
        buffer: editedScreenshotBuffer
      });
    }

    await window.sessionTrail.checkpoint.finalize({
      checkpointId: state.pendingCheckpoint.checkpoint.id,
      noteText: checkpointNoteText,
    });
    playFeedback("checkpoint_save");
    await loadSessionWorkspace(state.pendingCheckpoint.checkpoint.sessionId);
  };

  const retakePendingCheckpoint = async () => {
    if (!state.pendingCheckpoint) {
      return;
    }

    await window.sessionTrail.checkpoint.retake(state.pendingCheckpoint.checkpoint.id);
  };

  const assignSelectedSegmentSource = (selection: VisualSourceSelection) => {
    if (!selectedSegment) {
      return;
    }

    setComposition((current) =>
      current
        ? {
            ...current,
            segments: current.segments.map((segment) =>
              segment.id === selectedSegment.id
                ? {
                    ...segment,
                    sourceKind: selection.sourceKind,
                    sourceId: selection.sourceId,
                    mediaStartOffsetMs: selection.sourceKind === "imported_video"
                      ? getMediaStartOffsetMs(selection)
                      : 0,
                    source: "manual_edit"
                  }
                : segment
            )
          }
        : current
    );
    setCompositionDirty(true);
    if (selection.sourceKind === "checkpoint") {
      setSelectedCheckpointId(selection.sourceId);
      setSelectedImportId(null);
    } else {
      setSelectedImportId(selection.sourceId);
      setSelectedCheckpointId(null);
    }
  };

  const handleReflectPresetChange = useCallback((nextPreset: ReflectRangePreset) => {
    setReflectPreset(nextPreset);
    setReflectPeriodOffset(0);
  }, []);

  const handleReflectRefresh = useCallback(() => {
    setReflectRefreshToken((current) => current + 1);
  }, []);

  const handleReflectExport = useCallback(() => {
    void runPassiveAction(async () => {
      await window.sessionTrail.reflect.exportReport(reflectQuery);
    });
  }, [reflectQuery]);

  const selectedCheckpointDeleteReason =
    !selectedCheckpoint
      ? null
      : selectedCheckpoint.status !== "completed"
        ? "Only completed checkpoints can be deleted."
        : composition?.segments.some((segment) => segment.sourceKind === "checkpoint" && segment.sourceId === selectedCheckpoint.id)
          ? "This checkpoint is still used in the timeline. Reassign or remove its segment before deleting it."
          : null;
  const canDeleteSelectedCheckpoint =
    Boolean(selectedCheckpoint) &&
    selectedCheckpoint?.status === "completed" &&
    !selectedCheckpointDeleteReason;

  return (
    <MotionConfig reducedMotion="user">
      <AnimatedIconProvider enabled={motionEnabled}>
        <main className={appShellClassName}>
        <header className="topbar">
          <div className="topbar__brand">
            <div className="topbar__brand-mark">
              <img className="topbar__app-icon" src={APP_ICON_SRC} alt="" />
            </div>
            <div className="topbar__brand-copy">
              <div className="topbar__wordmark">
                <span className="topbar__wordmark-title">{state.appName}</span>
              </div>
              <div className={`topbar__session-pill topbar__session-pill--${headerStatus}`}>
                <span className={`topbar__session-pill-status topbar__session-pill-status--${headerStatus}`}>
                  <IconLabel
                    icon={HeaderStatusIcon}
                    label={headerStatus}
                    size={16}
                    active={headerStatus !== "idle"}
                  />
                </span>
                <span className="topbar__session-pill-title" title={headerSessionTitle}>
                  {headerSessionTitle}
                </span>
              </div>
            </div>
          </div>
          <LayoutGroup id="sessiontrail-topbar-nav">
            <nav className="topbar__nav">
              {VIEW_TABS.map(({ mode, label, icon: Icon }) => (
                <button
                key={mode}
                type="button"
                className={viewMode === mode ? "tab tab--active" : "tab"}
                onClick={() => setViewMode(mode)}
              >
                {motionEnabled && viewMode === mode ? (
                  <motion.span
                    className="tab__active-indicator"
                    layoutId="active-tab"
                    transition={SPRING_TRANSITION}
                  />
                ) : null}
                <IconLabel icon={Icon} label={label} active={viewMode === mode} className="tab__label" size={17} />
              </button>
              ))}
            </nav>
          </LayoutGroup>
        </header>

        <ToastStack toasts={toasts} motionEnabled={motionEnabled} onDismiss={dismissToast} />

      <AnimatePresence initial={false}>
        {state.pendingRecovery ? (
          <RecoveryBanner
            recovery={state.pendingRecovery}
            busy={busy}
            motionEnabled={motionEnabled}
            onResume={() => void runAction(() => window.sessionTrail.recovery.resume(state.pendingRecovery?.session.id))}
            onLeavePaused={() => void runAction(() => window.sessionTrail.recovery.leavePaused(state.pendingRecovery?.session.id))}
            onEndSession={() => void runAction(() => window.sessionTrail.recovery.endNow(state.pendingRecovery?.session.id))}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence initial={false}>
      {state.resumeNotice && activeSession?.id === state.resumeNotice.sessionId ? (
        <motion.section
          className="overlay-card"
          layout={motionEnabled}
          initial={motionEnabled ? "hidden" : false}
          animate="visible"
          exit={motionEnabled ? "exit" : undefined}
          variants={SURFACE_VARIANTS}
        >
          <div>
            <strong>Resume when ready</strong>
            <div>{state.resumeNotice.message}</div>
          </div>
          <div className="button-row">
            <button
              type="button"
              className="button"
              disabled={busy || activeSession.status !== "paused"}
              onClick={() =>
                void runAction(async () => {
                  await window.sessionTrail.session.resume(activeSession.id);
                  await window.sessionTrail.app.dismissResumeNotice();
                })
              }
            >
              <IconLabel icon={PlayIcon} label="Resume session" />
            </button>
            <button
              type="button"
              className="button button--ghost"
              disabled={busy}
              onClick={() => void runAction(() => window.sessionTrail.app.dismissResumeNotice())}
            >
              <IconLabel icon={XIcon} label="Dismiss" />
            </button>
          </div>
        </motion.section>
      ) : null}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {showReminderBanner ? (
          <ReminderBanner
            prompt={state.pendingReminderPrompt!}
            busy={busy}
            motionEnabled={motionEnabled}
            snoozeMinutes={state.settings.reminderSnoozeMinutes}
            onTakeScreenshot={() => void runAction(async () => { await window.sessionTrail.reminder.takeScreenshot(state.pendingReminderPrompt!.id); await loadSessionWorkspace(selectedSessionId); setViewMode("compose"); })}
            onSnooze={() => void runAction(() => window.sessionTrail.reminder.snooze(state.pendingReminderPrompt!.id))}
            onSkip={() => void runAction(() => window.sessionTrail.reminder.skip(state.pendingReminderPrompt!.id))}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence initial={false}>
      {state.pendingCheckpoint ? (
        <motion.div
          className="checkpoint-overlay"
          role="dialog"
          aria-modal="true"
          initial={motionEnabled ? "hidden" : false}
          animate="visible"
          exit={motionEnabled ? "exit" : undefined}
          variants={OVERLAY_VARIANTS}
        >
          <motion.div
            className="checkpoint-overlay__card"
            layout={motionEnabled}
            initial={motionEnabled ? "hidden" : false}
            animate="visible"
            exit={motionEnabled ? "exit" : undefined}
            variants={DIALOG_VARIANTS}
          >
            <div className="checkpoint-overlay__header">
              <h2 className="checkpoint-overlay__title">Add a checkpoint note</h2>
              <span className="badge">
                <IconLabel
                  icon={state.pendingCheckpoint.checkpoint.manualCheckpoint ? BookmarkPlusIcon : BellIcon}
                  label={`${state.pendingCheckpoint.checkpoint.manualCheckpoint ? "manual" : "reminder"} - ${formatDuration(state.pendingCheckpoint.checkpoint.workedOffsetSeconds)}`}
                  size={14}
                />
              </span>
            </div>
            <PendingCheckpointEditor
              pendingCheckpoint={state.pendingCheckpoint}
              noteText={checkpointNoteText}
              busy={busy}
              onNoteChange={setCheckpointNoteText}
              onRetake={() => void runAction(() => retakePendingCheckpoint())}
              onSave={(editedScreenshotBuffer) =>
                void runAction(async () => savePendingCheckpoint(await editedScreenshotBuffer))
              }
            />
          </motion.div>
        </motion.div>
      ) : null}
      </AnimatePresence>

      <AnimatePresence initial={false}>
      {cancelDialogSession ? (
        <motion.div
          className="checkpoint-overlay"
          role="dialog"
          aria-modal="true"
          initial={motionEnabled ? "hidden" : false}
          animate="visible"
          exit={motionEnabled ? "exit" : undefined}
          variants={OVERLAY_VARIANTS}
        >
          <motion.div
            className="checkpoint-overlay__card confirm-dialog"
            initial={motionEnabled ? "hidden" : false}
            animate="visible"
            exit={motionEnabled ? "exit" : undefined}
            variants={DIALOG_VARIANTS}
          >
            <div className="checkpoint-overlay__header">
              <div>
                <p className="confirm-dialog__eyebrow">Session action</p>
                <h2 className="checkpoint-overlay__title">Cancel "{cancelDialogSession.title}"?</h2>
              </div>
              <span className="badge">{cancelDialogSession.status}</span>
            </div>
            <div className="confirm-dialog__body">
              <p className="confirm-dialog__detail">
                Keep session data will stop timing and preserve checkpoints, recordings, and export drafts.
              </p>
              <p className="confirm-dialog__detail">
                Delete session data will remove the session and all related files.
              </p>
            </div>
            <div className="button-row confirm-dialog__actions">
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={() =>
                  void runAction(async () => {
                    playFeedback("confirmation");
                    await window.sessionTrail.session.cancel(cancelDialogSession.id);
                    setCancelDialogSessionId(null);
                  })
                }
              >
                <IconLabel icon={PauseIcon} label="Keep session data" />
              </button>
              <button
                type="button"
                className="button button--danger"
                disabled={busy}
                onClick={() =>
                  void runAction(async () => {
                    playFeedback("confirmation");
                    await window.sessionTrail.session.delete(cancelDialogSession.id);
                    setCancelDialogSessionId(null);
                  })
                }
              >
                <IconLabel icon={TrashIcon} label="Delete session data" />
              </button>
              <button
                type="button"
                className="button button--ghost"
                disabled={busy}
                onClick={() => setCancelDialogSessionId(null)}
              >
                <IconLabel icon={XIcon} label="Dismiss" />
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
      </AnimatePresence>

      <AnimatePresence mode="wait">
      {viewMode === "compose" ? (
        <motion.div
          key="compose-view"
          initial={motionEnabled ? "hidden" : false}
          animate="visible"
          exit={motionEnabled ? "exit" : undefined}
          variants={VIEW_VARIANTS}
        >
          <ComposeView
          motionEnabled={motionEnabled}
          selectedSessionId={selectedSessionId}
          loadedSessionId={loadedSessionId}
          sessions={sessions}
          selectedSession={selectedSession}
          canCheckpoint={canCheckpoint}
          busy={busy}
          recording={recording}
          compositionDirty={compositionDirty}
          workspaceLoading={workspaceLoading}
          sessionSwitching={sessionSwitching}
          nowMs={nowMs}
          composition={composition}
          segmentStyles={segmentStyles}
          checkpointsById={checkpointsById}
          importedMediaById={importedMediaById}
          selectedSegmentId={selectedSegmentId}
          playheadMs={playheadMs}
          effectiveVoiceDurationMs={effectiveVoiceDurationMs}
          recordingElapsedMs={recordingElapsedMs}
          importedMedia={importedMedia}
          timelineItems={timelineItems}
          activeCheckpointId={activeCheckpointId}
          activeImportId={activeImportId}
          recordingMarkers={recordingMarkers}
          voiceOver={voiceOver}
          voiceOverPreviewUrl={preparedVoiceOverPreviewUrl}
          voiceOverPreviewPreparing={voiceOverPreviewPreparing}
          audioRef={audioRef}
          audioPreviewDurationMs={audioPreviewDurationMs}
          audioCurrentTimeMs={audioCurrentTimeMs}
          activeExportJob={state.activeExportJob}
          activeMediaImportJob={state.activeMediaImportJob}
          pendingRecovery={Boolean(state.pendingRecovery)}
          pendingCheckpoint={Boolean(state.pendingCheckpoint)}
          trackRef={trackRef}
          audioPreviewActive={audioPreviewActive}
          armedVisualSource={armedVisualSource}
          selectedCheckpoint={selectedCheckpoint}
          selectedCheckpointThumbnailUrl={selectedCheckpointThumbnailUrl}
          selectedCheckpointPreviewUrl={selectedCheckpointPreviewUrl}
          selectedImport={selectedImport}
          previewSegment={previewSegment}
          previewCheckpoint={previewCheckpoint}
          previewCheckpointThumbnailUrl={previewCheckpointThumbnailUrl}
          previewCheckpointPreviewUrl={previewCheckpointPreviewUrl}
          previewImport={previewImport}
          selectedSegment={selectedSegment}
          inspectorNoteText={inspectorNoteText}
          canDeleteSelectedCheckpoint={canDeleteSelectedCheckpoint}
          selectedCheckpointDeleteReason={selectedCheckpointDeleteReason}
          currentImportVideoPlaybackMs={currentImportVideoPlaybackMs}
          onSelectSession={setSelectedSessionId}
          onCreateManualCheckpoint={() =>
            void runAction(async () => {
              if (!selectedSession) {
                return;
              }
              await window.sessionTrail.checkpoint.createManual(selectedSession.id);
              await loadSessionWorkspace(selectedSession.id);
            })
          }
          onSaveTimeline={() => void runAction(() => saveComposition())}
          onSelectSegment={(segmentId, selection) => {
            setSelectedSegmentId(segmentId);
            if (selection.sourceKind === "checkpoint") {
              setSelectedCheckpointId(selection.sourceId);
              setSelectedImportId(null);
            } else {
              setSelectedImportId(selection.sourceId);
              setSelectedCheckpointId(null);
            }
          }}
          onResizeHandleMouseDown={(segmentId, edge, event) => {
            event.preventDefault();
            event.stopPropagation();
            setDragState({ segmentId, edge });
          }}
          onPlayheadChange={setPlayheadMs}
          onMarkVisualSource={markVisualSource}
          onToggleRecording={() =>
            void runAction(() => (recording ? Promise.resolve(stopRecording()) : startRecording()))
          }
          onAudioMetadataLoaded={setAudioPreviewDurationMs}
          onAudioTimeUpdate={setAudioCurrentTimeMs}
          onPreviewVoiceOver={() =>
            void runPassiveAction(async () => {
              if (!voiceOver) {
                return;
              }

              if (preparedVoiceOverPreviewUrl && audioRef.current) {
                audioRef.current.pause();
                audioRef.current.currentTime = 0;
                setAudioCurrentTimeMs(0);
                setPlayheadMs(0);
                await audioRef.current.play();
                return;
              }

              pendingPreparedVoicePreviewPlaybackRef.current = true;
              await prepareVoiceOverPreview();
            })
          }
          onImportMedia={() =>
            void runPassiveAction(async () => {
              if (!selectedSession) {
                return;
              }
              await window.sessionTrail.media.importAssets(selectedSession.id);
              await loadSessionWorkspace(selectedSession.id);
            })
          }
          onDeleteImport={(assetId) => void runAction(() => deleteImportedMedia(assetId))}
          onChooseOutputPath={() =>
            void runAction(async () => {
              if (!selectedSession) {
                return;
              }
              const nextComposition = await window.sessionTrail.export.chooseOutputPath(selectedSession.id);
              setComposition(nextComposition);
              setCompositionDirty(false);
            })
          }
          onRevealOutput={() =>
            void runAction(() =>
              selectedSession ? window.sessionTrail.export.revealOutput(selectedSession.id) : Promise.resolve(false)
            )
          }
          onOpenOutput={() =>
            void runAction(() =>
              selectedSession ? window.sessionTrail.export.openOutput(selectedSession.id) : Promise.resolve(false)
            )
          }
          onBuildExport={() => void runAction(() => runExportBuild())}
          onCancelExport={() => void runAction(() => window.sessionTrail.export.cancel())}
          onRetryBuild={() => void runAction(() => runExportBuild())}
          onInspectorNoteChange={setInspectorNoteText}
          onSaveCheckpointNote={() => void runAction(() => saveSelectedCheckpointNote())}
          onDeleteSelectedCheckpoint={() => void runAction(() => deleteSelectedCheckpoint())}
          onAssignSegmentSource={assignSelectedSegmentSource}
          onImportVideoPlaybackUpdate={handleImportVideoPlaybackUpdate}
        />
        </motion.div>
      ) : (
        <motion.div
          key={`${viewMode}-view`}
          className="workspace workspace--single"
          initial={motionEnabled ? "hidden" : false}
          animate="visible"
          exit={motionEnabled ? "exit" : undefined}
          variants={VIEW_VARIANTS}
        >
          <section className="panel panel--main">
            {viewMode === "track" ? (
              <TrackView
                activeSession={activeSession}
                workedSeconds={workedSeconds}
                sessionTitle={sessionTitle}
                selectedSessionId={selectedSessionId}
                pendingRecovery={Boolean(state.pendingRecovery)}
                busy={busy}
                controlsBlocked={controlsBlocked}
                motionEnabled={motionEnabled}
                historyQuery={historyQuery}
                historyStatus={historyStatus}
                historyPage={historyPage}
                onSessionTitleChange={setSessionTitle}
                onStart={() => void runAction(async () => { await window.sessionTrail.session.start(sessionTitle.trim() ? { title: sessionTitle.trim() } : undefined); setSessionTitle(""); })}
                onPause={() => void runAction(() => window.sessionTrail.session.pause(activeSession?.id))}
                onResume={() => void runAction(async () => { await window.sessionTrail.session.resume(activeSession?.id); await window.sessionTrail.app.dismissResumeNotice(); })}
                onComplete={() =>
                  void runAction(async () => {
                    const completed = await window.sessionTrail.session.complete(activeSession?.id);
                    await refreshHistoryPage();
                    if (selectedSessionId === completed.id) {
                      await loadSessionWorkspace(completed.id);
                    }
                  })
                }
                onCancel={() => activeSession?.id && setCancelDialogSessionId(activeSession.id)}
                onSelectSession={setSelectedSessionId}
                onRenameHistorySession={(sessionId, title) =>
                  void runAction(() => renameHistorySession(sessionId, title))
                }
                onDeleteHistorySession={(sessionId) =>
                  void runAction(() => deleteHistorySession(sessionId))
                }
                onHistoryQueryChange={setHistoryQuery}
                onHistoryStatusChange={setHistoryStatus}
                onPreviousPage={() => setHistoryOffset((current) => Math.max(0, current - HISTORY_PAGE_SIZE))}
                onNextPage={() => setHistoryOffset((current) => current + HISTORY_PAGE_SIZE)}
              />
            ) : null}

            {viewMode === "reflect" ? (
              <ReflectView
                summary={reflectSummary}
                loading={reflectLoading}
                busy={busy}
                preset={reflectPreset}
                periodOffset={reflectPeriodOffset}
                dailyGoalMinutes={state.settings.reflectDailyGoalMinutes}
                dashboardFullscreen={state.dashboardFullscreen}
                selectedSessionId={selectedReflectSessionId}
                onPresetChange={handleReflectPresetChange}
                onPeriodOffsetChange={setReflectPeriodOffset}
                onRefresh={handleReflectRefresh}
                onSelectSession={setSelectedReflectSessionId}
                onExportReport={handleReflectExport}
              />
            ) : null}

            {viewMode === "settings" ? (
              <SettingsView
                settings={state.settings}
                draft={settingsDraft}
                busy={busy}
                motionEnabled={motionEnabled}
                onChange={(patch) => setSettingsDraft((current) => ({ ...current, ...patch }))}
                onSave={() => void runAction(() => saveSettings())}
                onShow={() => void window.sessionTrail.app.showDashboard()}
                onHide={() => void window.sessionTrail.app.hideDashboard()}
                onQuit={() => void window.sessionTrail.app.quit()}
              />
            ) : null}
          </section>
        </motion.div>
      )}
      </AnimatePresence>
      </main>
      </AnimatedIconProvider>
    </MotionConfig>
  );
}
