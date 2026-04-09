import type Database from "better-sqlite3";
import { patchAppState } from "./app-state";
import { CheckpointRepository } from "./db/repos/checkpoint-repository";
import { RuntimeStateRepository } from "./db/repos/runtime-state-repository";
import { SessionRepository } from "./db/repos/session-repository";
import { logInfo } from "./logger";
import type { RecoverySessionSummary, SessionSummary } from "../shared/contracts";
import type { SessionMachine } from "./session-machine";

const CLEAN_SHUTDOWN_KEY = "app.clean_shutdown";
const LAST_BOOTED_AT_KEY = "app.last_booted_at";
const CLEAN_TRUE = "1";
const CLEAN_FALSE = "0";

function nowIso(): string {
  return new Date().toISOString();
}

export class RecoveryService {
  private readonly runtimeStateRepository: RuntimeStateRepository;
  private readonly sessionRepository: SessionRepository;
  private readonly checkpointRepository: CheckpointRepository;
  private pendingRecovery: RecoverySessionSummary | null = null;

  public constructor(
    db: Database.Database,
    private readonly sessionMachine: SessionMachine
  ) {
    this.runtimeStateRepository = new RuntimeStateRepository(db);
    this.sessionRepository = new SessionRepository(db);
    this.checkpointRepository = new CheckpointRepository(db);
  }

  public runStartupRecovery(): RecoverySessionSummary | null {
    const wasCleanShutdown = this.runtimeStateRepository.get(CLEAN_SHUTDOWN_KEY)?.value === CLEAN_TRUE;
    this.runtimeStateRepository.set(CLEAN_SHUTDOWN_KEY, CLEAN_FALSE);
    this.runtimeStateRepository.set(LAST_BOOTED_AT_KEY, nowIso());

    if (wasCleanShutdown) {
      this.pendingRecovery = null;
      patchAppState({ pendingRecovery: null });
      return null;
    }

    const interruptedSession = this.sessionRepository.findLatestOpenSession();
    if (!interruptedSession) {
      this.pendingRecovery = null;
      patchAppState({ pendingRecovery: null });
      return null;
    }

    const recoveredSession = this.sessionMachine.recoverInterruptedSession(interruptedSession.id);
    const shellCheckpointCount = this.checkpointRepository.listShellsBySessionId(recoveredSession.id).length;

    this.pendingRecovery = {
      session: recoveredSession,
      reason: "unclean_shutdown",
      recoveredAt: nowIso(),
      shellCheckpointCount
    };

    patchAppState({ pendingRecovery: this.pendingRecovery });
    logInfo("Prepared startup recovery.", {
      sessionId: recoveredSession.id,
      shellCheckpointCount
    });

    return this.pendingRecovery;
  }

  public getPending(): RecoverySessionSummary | null {
    return this.pendingRecovery;
  }

  public resume(sessionId?: string): SessionSummary {
    const recovery = this.requirePendingRecovery(sessionId);
    const resumed = this.sessionMachine.resume(recovery.session.id);
    this.clearPendingRecovery();
    return resumed;
  }

  public leavePaused(sessionId?: string): SessionSummary | null {
    const recovery = this.requirePendingRecovery(sessionId);
    const paused = this.sessionMachine.getById(recovery.session.id);
    this.clearPendingRecovery();
    return paused;
  }

  public endNow(sessionId?: string): SessionSummary {
    const recovery = this.requirePendingRecovery(sessionId);
    const completed = this.sessionMachine.complete(recovery.session.id);
    this.clearPendingRecovery();
    return completed;
  }

  public markCleanShutdown(): void {
    this.runtimeStateRepository.set(CLEAN_SHUTDOWN_KEY, CLEAN_TRUE);
    logInfo("Marked clean shutdown.");
  }

  private requirePendingRecovery(sessionId?: string): RecoverySessionSummary {
    if (!this.pendingRecovery) {
      throw new Error("No pending recovery state exists.");
    }

    if (sessionId && sessionId !== this.pendingRecovery.session.id) {
      throw new Error("Requested recovery session does not match the pending recovery state.");
    }

    return this.pendingRecovery;
  }

  private clearPendingRecovery(): void {
    this.pendingRecovery = null;
    patchAppState({ pendingRecovery: null });
  }
}
