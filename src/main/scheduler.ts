import { Notification } from "electron";
import type { SessionSummary } from "../shared/contracts";
import { logError } from "./logger";
import type { ReminderPromptService } from "./reminder-prompt-service";
import type { SessionMachine } from "./session-machine";
import { showDashboardWindow } from "./window-manager";

const TICK_INTERVAL_MS = 1_000;

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

export class ReminderScheduler {
  private tickTimer: NodeJS.Timeout | null = null;

  public constructor(
    private readonly sessionMachine: SessionMachine,
    private readonly reminderPromptService: ReminderPromptService
  ) {}

  public start(): void {
    if (this.tickTimer) {
      return;
    }

    this.tickTimer = setInterval(() => {
      void this.tick();
    }, TICK_INTERVAL_MS);
  }

  public stop(): void {
    if (!this.tickTimer) {
      return;
    }

    clearInterval(this.tickTimer);
    this.tickTimer = null;
  }

  private async tick(): Promise<void> {
    const activeSession = this.sessionMachine.getActive();
    if (!activeSession || activeSession.status !== "active") {
      return;
    }

    const currentWorkedSeconds = getLiveWorkedSeconds(activeSession);
    this.maybeNotifyTargetReached(activeSession, currentWorkedSeconds);

    if (this.reminderPromptService.syncForSession(activeSession)) {
      return;
    }

    const intervalSeconds = activeSession.reminderIntervalMinutes * 60;
    const latestReminderOffset = this.reminderPromptService.getLatestTriggeredOffset(activeSession.id);
    const nextReminderOffset =
      latestReminderOffset !== null ? latestReminderOffset + intervalSeconds : intervalSeconds;

    if (currentWorkedSeconds < nextReminderOffset) {
      return;
    }

    try {
      this.reminderPromptService.createPrompt(activeSession, nextReminderOffset);
    } catch (error) {
      logError("Failed to create reminder prompt.", error);
    }
  }

  private maybeNotifyTargetReached(session: SessionSummary, currentWorkedSeconds: number): void {
    if (!session.allowOvertime || session.overtimeStartedAt || currentWorkedSeconds < session.targetWorkSeconds) {
      return;
    }

    this.sessionMachine.markOvertimeStarted(session.id);
    this.showTargetReachedNotification(session);
  }

  private showTargetReachedNotification(session: SessionSummary): void {
    if (!Notification.isSupported()) {
      return;
    }

    const notification = new Notification({
      title: "SessionTrail target reached",
      body: `${session.title} reached ${formatDuration(session.targetWorkSeconds)} of worked time.`
    });

    notification.on("click", () => {
      showDashboardWindow();
    });
    notification.show();
  }
}

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600).toString().padStart(2, "0");
  const minutes = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}
