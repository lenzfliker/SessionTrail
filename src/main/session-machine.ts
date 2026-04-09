import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { getAppState, patchAppState } from "./app-state";
import { CheckpointRepository } from "./db/repos/checkpoint-repository";
import { SessionRepository } from "./db/repos/session-repository";
import { SnapshotRepository } from "./db/repos/snapshot-repository";
import { WorkSegmentRepository } from "./db/repos/work-segment-repository";
import { logError, logInfo } from "./logger";
import type { SettingsService } from "./settings-service";
import type { SessionEntity, WorkSegmentCloseReason, WorkSegmentEntity } from "./db/entities";
import type {
  RenameSessionInput,
  SessionHistoryPage,
  SessionHistoryQuery,
  SessionSummary,
  StartSessionInput
} from "../shared/contracts";

const DEFAULT_REMINDER_INTERVAL_MINUTES = 10;
const HEARTBEAT_INTERVAL_MS = 15_000;
const RECENT_SESSION_LIMIT = 6;

function nowIso(): string {
  return new Date().toISOString();
}

function diffSeconds(startedAt: string, endedAt: string): number {
  return Math.max(0, Math.floor((Date.parse(endedAt) - Date.parse(startedAt)) / 1000));
}

function getLiveWorkedSeconds(session: SessionSummary): number {
  if (session.status !== "active" || !session.lastHeartbeatAt) {
    return session.workedSeconds;
  }

  const elapsedSinceHeartbeat = Math.max(
    0,
    Math.floor((Date.now() - Date.parse(session.lastHeartbeatAt)) / 1000)
  );

  return session.workedSeconds + elapsedSinceHeartbeat;
}

function makeDefaultTitle(): string {
  const now = new Date();
  const date = now.toLocaleDateString("en-CA");
  const time = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit"
  });
  return `Focus Session ${date} ${time}`;
}

export class SessionMachine {
  private readonly sessionEvents = new EventEmitter();
  private readonly sessionRepository: SessionRepository;
  private readonly workSegmentRepository: WorkSegmentRepository;
  private readonly snapshotRepository: SnapshotRepository;
  private readonly checkpointRepository: CheckpointRepository;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private currentSessionId: string | null = null;

  public constructor(
    private readonly db: Database.Database,
    private readonly settingsService: SettingsService
  ) {
    this.sessionRepository = new SessionRepository(db);
    this.workSegmentRepository = new WorkSegmentRepository(db);
    this.snapshotRepository = new SnapshotRepository(db);
    this.checkpointRepository = new CheckpointRepository(db);
  }

  public initialize(): void {
    const activeSession = this.sessionRepository.findLatestOpenSession();
    this.currentSessionId = activeSession?.id ?? null;
    this.publishState();
  }

  public onUpdated(listener: (session: SessionSummary | null) => void): () => void {
    this.sessionEvents.on("updated", listener);
    return () => {
      this.sessionEvents.off("updated", listener);
    };
  }

  public getActive(): SessionSummary | null {
    if (!this.currentSessionId) {
      const activeSession = this.sessionRepository.findLatestOpenSession();
      this.currentSessionId = activeSession?.id ?? null;
    }

    if (!this.currentSessionId) {
      return null;
    }

    return this.getById(this.currentSessionId);
  }

  public getById(sessionId: string): SessionSummary | null {
    const session = this.sessionRepository.findById(sessionId);
    if (!session) {
      return null;
    }

    const openSegment = this.workSegmentRepository.findOpenBySessionId(sessionId);
    return this.toSummary(session, openSegment);
  }

  public listRecent(): SessionSummary[] {
    return this.loadRecentSummaries();
  }

  public listHistory(query: SessionHistoryQuery = {}): SessionHistoryPage {
    const limit = Math.max(1, Math.min(100, Math.round(query.limit ?? 20)));
    const offset = Math.max(0, Math.round(query.offset ?? 0));
    const normalizedQuery = {
      ...query,
      limit,
      offset
    };

    return {
      items: this.sessionRepository.listHistory(normalizedQuery).map((session) => {
        const openSegment = this.workSegmentRepository.findOpenBySessionId(session.id);
        return this.toSummary(session, openSegment);
      }),
      total: this.sessionRepository.countHistory(normalizedQuery),
      limit,
      offset
    };
  }

  public getLatestReminderOffset(sessionId: string): number | null {
    return this.checkpointRepository.findLatestReminderOffset(sessionId);
  }

  public getWorkedSecondsForCheckpoint(sessionId: string): number {
    const session = this.getById(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} was not found.`);
    }

    return getLiveWorkedSeconds(session);
  }

  public start(input?: StartSessionInput): SessionSummary {
    if (this.sessionRepository.findLatestOpenSession()) {
      throw new Error("A session is already active or paused.");
    }

    const settings = this.settingsService.getSettings();
    const startedAt = nowIso();
    const session: SessionEntity = {
      id: randomUUID(),
      title: input?.title?.trim() || makeDefaultTitle(),
      targetWorkSeconds: settings.defaultTargetMinutes * 60,
      workedSeconds: 0,
      status: "active",
      reminderIntervalMinutes: settings.reminderIntervalMinutes ?? DEFAULT_REMINDER_INTERVAL_MINUTES,
      screenshotMode: "full_desktop",
      allowOvertime: true,
      overtimeStartedAt: null,
      startedAt,
      endedAt: null,
      lastHeartbeatAt: startedAt,
      createdAt: startedAt,
      updatedAt: startedAt
    };

    const activeSegment: WorkSegmentEntity = {
      id: randomUUID(),
      sessionId: session.id,
      type: "active",
      startedAt,
      endedAt: null,
      workedSeconds: 0,
      closeReason: null,
      createdAt: startedAt
    };

    const createSession = this.db.transaction(() => {
      this.sessionRepository.create(session);
      this.workSegmentRepository.create(activeSegment);
      this.recordSnapshot(session.id, activeSegment.id, session.workedSeconds, startedAt);
    });

    createSession();
    this.currentSessionId = session.id;
    this.publishState();
    logInfo("Started session.", { sessionId: session.id, title: session.title });

    return this.toSummary(session, activeSegment);
  }

  public pause(sessionId?: string): SessionSummary {
    const targetSession = this.resolveOpenSession(sessionId);
    if (targetSession.status !== "active") {
      throw new Error("Only an active session can be paused.");
    }

    const summary = this.transitionActiveSessionToPaused(targetSession.id, "pause", true);
    this.currentSessionId = summary.id;
    this.publishState();
    logInfo("Paused session.", { sessionId: summary.id });

    return summary;
  }

  public resume(sessionId?: string): SessionSummary {
    const targetSession = this.resolveOpenSession(sessionId);
    if (targetSession.status !== "paused") {
      throw new Error("Only a paused session can be resumed.");
    }

    const resumedSummary = this.db.transaction(() => {
      const session = this.mustFindSession(targetSession.id);
      const openSegment = this.mustFindOpenSegment(targetSession.id);
      if (openSegment.type !== "paused") {
        throw new Error("Paused session is missing a paused segment.");
      }

      const resumedAt = nowIso();
      openSegment.endedAt = resumedAt;
      this.workSegmentRepository.update(openSegment);

      const activeSegment: WorkSegmentEntity = {
        id: randomUUID(),
        sessionId: session.id,
        type: "active",
        startedAt: resumedAt,
        endedAt: null,
        workedSeconds: 0,
        closeReason: null,
        createdAt: resumedAt
      };

      session.status = "active";
      session.updatedAt = resumedAt;
      session.lastHeartbeatAt = resumedAt;
      session.endedAt = null;

      this.sessionRepository.update(session);
      this.workSegmentRepository.create(activeSegment);
      this.recordSnapshot(session.id, activeSegment.id, session.workedSeconds, resumedAt);

      return this.toSummary(session, activeSegment);
    })();

    this.currentSessionId = resumedSummary.id;
    this.publishState();
    logInfo("Resumed session.", { sessionId: resumedSummary.id });

    return resumedSummary;
  }

  public suspend(sessionId?: string): SessionSummary {
    const targetSession = this.resolveOpenSession(sessionId);
    if (targetSession.status !== "active") {
      throw new Error("Only an active session can be suspended.");
    }

    const summary = this.transitionActiveSessionToPaused(targetSession.id, "suspend", true);
    this.currentSessionId = summary.id;
    this.publishState();
    logInfo("Suspended session.", { sessionId: summary.id });

    return summary;
  }

  public complete(sessionId?: string): SessionSummary {
    const targetSession = this.resolveOpenSession(sessionId);

    const completedSummary = this.db.transaction(() => {
      const session = this.mustFindSession(targetSession.id);
      const openSegment = this.mustFindOpenSegment(targetSession.id);
      const completedAt = nowIso();

      if (openSegment.type === "active") {
        const additionalWorked = this.calculateAdditionalWorkedSeconds(session, openSegment, completedAt);
        session.workedSeconds += additionalWorked;
        session.lastHeartbeatAt = completedAt;
        openSegment.workedSeconds += additionalWorked;
      }

      openSegment.endedAt = completedAt;
      openSegment.closeReason = "complete";
      session.status = "completed";
      session.endedAt = completedAt;
      session.updatedAt = completedAt;

      this.workSegmentRepository.update(openSegment);
      this.sessionRepository.update(session);
      this.recordSnapshot(session.id, null, session.workedSeconds, completedAt);

      return this.toSummary(session, null);
    })();

    this.currentSessionId = null;
    this.publishState();
    logInfo("Completed session.", { sessionId: completedSummary.id });

    return completedSummary;
  }

  public cancel(sessionId?: string): SessionSummary {
    const targetSession = this.resolveOpenSession(sessionId);

    const canceledSummary = this.db.transaction(() => {
      const session = this.mustFindSession(targetSession.id);
      const openSegment = this.mustFindOpenSegment(targetSession.id);
      const canceledAt = nowIso();

      if (openSegment.type === "active") {
        const additionalWorked = this.calculateAdditionalWorkedSeconds(session, openSegment, canceledAt);
        session.workedSeconds += additionalWorked;
        session.lastHeartbeatAt = canceledAt;
        openSegment.workedSeconds += additionalWorked;
      }

      openSegment.endedAt = canceledAt;
      openSegment.closeReason = "cancel";
      session.status = "canceled";
      session.endedAt = canceledAt;
      session.updatedAt = canceledAt;

      this.workSegmentRepository.update(openSegment);
      this.sessionRepository.update(session);
      this.recordSnapshot(session.id, null, session.workedSeconds, canceledAt);

      return this.toSummary(session, null);
    })();

    this.currentSessionId = null;
    this.publishState();
    logInfo("Canceled session.", { sessionId: canceledSummary.id });

    return canceledSummary;
  }

  public rename(input: RenameSessionInput): SessionSummary {
    const title = input.title.trim();
    if (!title) {
      throw new Error("Session title cannot be empty.");
    }

    const session = this.mustFindSession(input.sessionId);
    this.sessionRepository.renameById(session.id, title);
    this.publishState();
    logInfo("Renamed session.", { sessionId: session.id, title });

    const renamed = this.getById(session.id);
    if (!renamed) {
      throw new Error(`Session ${session.id} was not found after rename.`);
    }

    return renamed;
  }

  public deleteSession(sessionId?: string): void {
    const resolvedSessionId =
      sessionId ?? this.currentSessionId ?? this.sessionRepository.findLatestOpenSession()?.id;
    if (!resolvedSessionId) {
      throw new Error("No session exists to delete.");
    }

    this.sessionRepository.deleteById(resolvedSessionId);
    if (this.currentSessionId === resolvedSessionId) {
      this.currentSessionId = null;
    }
    this.publishState();
    logInfo("Deleted session.", { sessionId: resolvedSessionId });
  }

  public flushForAppShutdown(): void {
    const activeSession = this.getActive();
    if (!activeSession || activeSession.status !== "active") {
      this.stopHeartbeatTimer();
      return;
    }

    this.transitionActiveSessionToPaused(activeSession.id, "app_exit", true);
    this.currentSessionId = activeSession.id;
    this.publishState();
  }

  public recoverInterruptedSession(sessionId: string): SessionSummary {
    const session = this.mustFindSession(sessionId);
    if (session.status !== "active") {
      return this.getById(sessionId) ?? this.toSummary(session, this.workSegmentRepository.findOpenBySessionId(sessionId));
    }

    const summary = this.transitionActiveSessionToPaused(sessionId, "crash_recovery", false);
    this.currentSessionId = summary.id;
    this.publishState();
    logInfo("Recovered interrupted session.", { sessionId: summary.id });

    return summary;
  }

  public markOvertimeStarted(sessionId: string, startedAt = nowIso()): SessionSummary {
    const summary = this.db.transaction(() => {
      const session = this.mustFindSession(sessionId);
      const openSegment = this.workSegmentRepository.findOpenBySessionId(sessionId);

      if (session.overtimeStartedAt) {
        return this.toSummary(session, openSegment);
      }

      session.overtimeStartedAt = startedAt;
      session.updatedAt = startedAt;
      this.sessionRepository.update(session);
      this.recordSnapshot(session.id, openSegment?.id ?? null, session.workedSeconds, startedAt);

      return this.toSummary(session, openSegment);
    })();

    this.publishState();
    logInfo("Marked session target reached.", { sessionId });
    return summary;
  }

  private transitionActiveSessionToPaused(
    sessionId: string,
    closeReason: Exclude<WorkSegmentCloseReason, null>,
    includeElapsedSinceLastHeartbeat: boolean
  ): SessionSummary {
    return this.db.transaction(() => {
      const session = this.mustFindSession(sessionId);
      const openSegment = this.mustFindOpenSegment(sessionId);
      if (openSegment.type !== "active") {
        throw new Error("Active session is missing an active segment.");
      }

      const pausedAt = nowIso();
      const additionalWorked = includeElapsedSinceLastHeartbeat
        ? this.calculateAdditionalWorkedSeconds(session, openSegment, pausedAt)
        : 0;

      session.workedSeconds += additionalWorked;
      session.lastHeartbeatAt = pausedAt;
      session.status = "paused";
      session.updatedAt = pausedAt;

      openSegment.workedSeconds += additionalWorked;
      openSegment.endedAt = pausedAt;
      openSegment.closeReason = closeReason;

      const pausedSegment: WorkSegmentEntity = {
        id: randomUUID(),
        sessionId: session.id,
        type: "paused",
        startedAt: pausedAt,
        endedAt: null,
        workedSeconds: 0,
        closeReason: null,
        createdAt: pausedAt
      };

      this.workSegmentRepository.update(openSegment);
      this.sessionRepository.update(session);
      this.workSegmentRepository.create(pausedSegment);
      this.recordSnapshot(session.id, pausedSegment.id, session.workedSeconds, pausedAt);

      return this.toSummary(session, pausedSegment);
    })();
  }

  private calculateAdditionalWorkedSeconds(
    session: SessionEntity,
    openSegment: WorkSegmentEntity,
    effectiveAt: string
  ): number {
    const baseline = session.lastHeartbeatAt ?? openSegment.startedAt;
    return diffSeconds(baseline, effectiveAt);
  }

  private mustFindSession(sessionId: string): SessionEntity {
    const session = this.sessionRepository.findById(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} was not found.`);
    }

    return session;
  }

  private mustFindOpenSegment(sessionId: string): WorkSegmentEntity {
    const openSegment = this.workSegmentRepository.findOpenBySessionId(sessionId);
    if (!openSegment) {
      throw new Error(`Open work segment for session ${sessionId} was not found.`);
    }

    return openSegment;
  }

  private resolveOpenSession(sessionId?: string): SessionSummary {
    const resolvedSessionId =
      sessionId ?? this.currentSessionId ?? this.sessionRepository.findLatestOpenSession()?.id;
    if (!resolvedSessionId) {
      throw new Error("No active or paused session exists.");
    }

    const session = this.getById(resolvedSessionId);
    if (!session || (session.status !== "active" && session.status !== "paused")) {
      throw new Error("No active or paused session exists.");
    }

    return session;
  }

  private publishState(): void {
    const activeSession = this.sessionRepository.findLatestOpenSession();
    this.currentSessionId = activeSession?.id ?? null;

    const currentSummary = this.currentSessionId ? this.getById(this.currentSessionId) : null;
    const recentSessions = this.loadRecentSummaries();
    const resumeNotice = currentSummary?.status === "paused" ? getAppState().resumeNotice : null;

    patchAppState({
      activeSession: currentSummary,
      recentSessions,
      resumeNotice
    });

    if (currentSummary?.status === "active") {
      this.startHeartbeatTimer();
    } else {
      this.stopHeartbeatTimer();
    }

    this.sessionEvents.emit("updated", currentSummary);
  }

  private loadRecentSummaries(): SessionSummary[] {
    return this.sessionRepository.listRecent(RECENT_SESSION_LIMIT).map((session) => {
      const openSegment = this.workSegmentRepository.findOpenBySessionId(session.id);
      return this.toSummary(session, openSegment);
    });
  }

  private toSummary(session: SessionEntity, openSegment: WorkSegmentEntity | null): SessionSummary {
    return {
      id: session.id,
      title: session.title,
      status: session.status,
      workedSeconds: session.workedSeconds,
      targetWorkSeconds: session.targetWorkSeconds,
      reminderIntervalMinutes: session.reminderIntervalMinutes,
      screenshotMode: session.screenshotMode,
      allowOvertime: session.allowOvertime,
      overtimeStartedAt: session.overtimeStartedAt,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      lastHeartbeatAt: session.lastHeartbeatAt,
      currentSegmentId: openSegment?.id ?? null,
      currentSegmentType: openSegment?.type ?? null,
      currentSegmentStartedAt: openSegment?.startedAt ?? null,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt
    };
  }

  private startHeartbeatTimer(): void {
    if (this.heartbeatTimer) {
      return;
    }

    this.heartbeatTimer = setInterval(() => {
      try {
        this.recordHeartbeat();
      } catch (error) {
        logError("Failed to persist session heartbeat.", error);
        patchAppState({ lastErrorMessage: "Failed to persist session heartbeat." });
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeatTimer(): void {
    if (!this.heartbeatTimer) {
      return;
    }

    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  private recordHeartbeat(): void {
    const activeSession = this.getActive();
    if (!activeSession || activeSession.status !== "active") {
      return;
    }

    this.db.transaction(() => {
      const session = this.mustFindSession(activeSession.id);
      const openSegment = this.mustFindOpenSegment(activeSession.id);
      if (openSegment.type !== "active") {
        return;
      }

      const heartbeatAt = nowIso();
      const additionalWorked = this.calculateAdditionalWorkedSeconds(session, openSegment, heartbeatAt);
      if (additionalWorked <= 0) {
        return;
      }

      session.workedSeconds += additionalWorked;
      session.lastHeartbeatAt = heartbeatAt;
      session.updatedAt = heartbeatAt;
      openSegment.workedSeconds += additionalWorked;

      this.sessionRepository.update(session);
      this.workSegmentRepository.update(openSegment);
      this.recordSnapshot(session.id, openSegment.id, session.workedSeconds, heartbeatAt);
    })();

    this.publishState();
  }

  private recordSnapshot(
    sessionId: string,
    activeSegmentId: string | null,
    workedSecondsCached: number,
    recordedAt: string
  ): void {
    this.snapshotRepository.record({
      id: randomUUID(),
      sessionId,
      recordedAt,
      activeSegmentId,
      workedSecondsCached,
      pendingCheckpointPayloadJson: null,
      pendingExportPayloadJson: null
    });
  }
}
