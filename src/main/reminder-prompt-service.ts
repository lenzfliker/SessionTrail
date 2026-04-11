import type Database from "better-sqlite3";
import { Notification } from "electron";
import { randomUUID } from "node:crypto";
import { patchAppState } from "./app-state";
import type { CheckpointService } from "./checkpoint-service";
import type { ReminderPromptEntity } from "./db/entities";
import { ReminderPromptRepository } from "./db/repos/reminder-prompt-repository";
import { CheckpointRepository } from "./db/repos/checkpoint-repository";
import { logInfo } from "./logger";
import { RUNTIME_STATE_KEYS, RuntimeStateStore } from "./runtime-state-store";
import type { SessionMachine } from "./session-machine";
import type { SettingsService } from "./settings-service";
import type { PendingCheckpoint, ReminderPromptSummary, SessionSummary } from "../shared/contracts";
import { showDashboardWindow } from "./window-manager";

function nowIso(): string {
  return new Date().toISOString();
}

function toSummary(prompt: ReminderPromptEntity): ReminderPromptSummary {
  if (prompt.status !== "pending" && prompt.status !== "snoozed") {
    throw new Error("Only pending or snoozed reminder prompts can be displayed.");
  }

  return {
    id: prompt.id,
    sessionId: prompt.sessionId,
    workedOffsetSeconds: prompt.workedOffsetSeconds,
    status: prompt.status,
    createdAt: prompt.createdAt,
    snoozedUntil: prompt.snoozedUntil
  };
}

export class ReminderPromptService {
  private readonly reminderPromptRepository: ReminderPromptRepository;
  private readonly checkpointRepository: CheckpointRepository;
  private readonly runtimeStateStore: RuntimeStateStore;
  private pendingPrompt: ReminderPromptSummary | null = null;

  public constructor(
    db: Database.Database,
    private readonly sessionMachine: SessionMachine,
    private readonly checkpointService: CheckpointService,
    private readonly settingsService: SettingsService
  ) {
    this.reminderPromptRepository = new ReminderPromptRepository(db);
    this.checkpointRepository = new CheckpointRepository(db);
    this.runtimeStateStore = new RuntimeStateStore(db);
  }

  public initialize(): void {
    const persisted = this.runtimeStateStore.getJson<ReminderPromptSummary>(
      RUNTIME_STATE_KEYS.pendingReminderPrompt
    );
    const prompt =
      (persisted ? this.reminderPromptRepository.findById(persisted.id) : null) ??
      this.reminderPromptRepository.findLatestActivePrompt();
    if (!prompt) {
      this.pendingPrompt = null;
      this.persistPendingPrompt(null);
      patchAppState({ pendingReminderPrompt: null });
      return;
    }

    if (prompt.status === "snoozed" && prompt.snoozedUntil && Date.parse(prompt.snoozedUntil) > Date.now()) {
      this.pendingPrompt = null;
      this.persistPendingPrompt(null);
      patchAppState({ pendingReminderPrompt: null });
      return;
    }

    if (prompt.status === "snoozed") {
      prompt.status = "pending";
      prompt.updatedAt = nowIso();
      prompt.snoozedUntil = null;
      this.reminderPromptRepository.update(prompt);
    }

    this.pendingPrompt = toSummary(prompt);
    this.persistPendingPrompt(this.pendingPrompt);
    patchAppState({ pendingReminderPrompt: this.pendingPrompt });
  }

  public getPendingPrompt(): ReminderPromptSummary | null {
    return this.pendingPrompt;
  }

  public hasOpenPromptForSession(sessionId: string): boolean {
    return Boolean(this.reminderPromptRepository.findLatestPendingBySessionId(sessionId));
  }

  public getLatestTriggeredOffset(sessionId: string): number | null {
    const reminderPromptOffset = this.reminderPromptRepository.findLatestTriggeredOffset(sessionId);
    const checkpointOffset = this.checkpointRepository.findLatestReminderOffset(sessionId);

    if (reminderPromptOffset === null) {
      return checkpointOffset;
    }

    if (checkpointOffset === null) {
      return reminderPromptOffset;
    }

    return Math.max(reminderPromptOffset, checkpointOffset);
  }

  public syncForSession(session: SessionSummary): ReminderPromptSummary | null {
    const prompt = this.reminderPromptRepository.findLatestPendingBySessionId(session.id);
    if (!prompt) {
      if (this.pendingPrompt?.sessionId === session.id) {
        this.pendingPrompt = null;
        this.persistPendingPrompt(null);
        patchAppState({ pendingReminderPrompt: null });
      }
      return null;
    }

    if (prompt.status === "snoozed" && prompt.snoozedUntil && Date.parse(prompt.snoozedUntil) > Date.now()) {
      if (this.pendingPrompt?.id === prompt.id) {
        this.pendingPrompt = null;
        this.persistPendingPrompt(null);
        patchAppState({ pendingReminderPrompt: null });
      }
      return null;
    }

    if (prompt.status === "snoozed") {
      prompt.status = "pending";
      prompt.snoozedUntil = null;
      prompt.updatedAt = nowIso();
      this.reminderPromptRepository.update(prompt);
    }

    const summary = toSummary(prompt);
    if (this.pendingPrompt?.id !== summary.id) {
      this.pendingPrompt = summary;
      this.persistPendingPrompt(summary);
      patchAppState({ pendingReminderPrompt: summary });
      if (this.settingsService.getSettings().openDashboardOnReminder) {
        showDashboardWindow();
      }
      this.showNotification(session.title);
    } else {
      this.pendingPrompt = summary;
      this.persistPendingPrompt(summary);
      patchAppState({ pendingReminderPrompt: summary });
    }

    return summary;
  }

  public createPrompt(session: SessionSummary, workedOffsetSeconds: number): ReminderPromptSummary {
    const existing = this.reminderPromptRepository.findLatestPendingBySessionId(session.id);
    if (existing) {
      return toSummary(existing.status === "pending" ? existing : { ...existing, status: "pending", snoozedUntil: null });
    }

    const createdAt = nowIso();
    const prompt = {
      id: randomUUID(),
      sessionId: session.id,
      workedOffsetSeconds,
      status: "pending" as const,
      snoozeCount: 0,
      snoozedUntil: null,
      createdAt,
      updatedAt: createdAt,
      resolvedAt: null
    };

    this.reminderPromptRepository.create(prompt);
    const summary = toSummary(prompt);
    this.pendingPrompt = summary;
    this.persistPendingPrompt(summary);
    patchAppState({ pendingReminderPrompt: summary });
    if (this.settingsService.getSettings().openDashboardOnReminder) {
      showDashboardWindow();
    }
    this.showNotification(session.title);
    logInfo("Created reminder prompt.", {
      reminderPromptId: prompt.id,
      sessionId: session.id,
      workedOffsetSeconds
    });

    return summary;
  }

  public async takeScreenshot(reminderPromptId: string): Promise<PendingCheckpoint> {
    const prompt = this.requirePrompt(reminderPromptId);
    const session = this.sessionMachine.getById(prompt.sessionId);
    if (!session || (session.status !== "active" && session.status !== "paused")) {
      throw new Error("Reminder prompt session is no longer active or paused.");
    }

    const workedOffsetSeconds = this.sessionMachine.getWorkedSecondsForCheckpoint(session.id);
    const checkpoint = await this.checkpointService.createReminderCheckpoint(session, workedOffsetSeconds, {
      captureDelayMs: this.settingsService.getSettings().captureDelaySeconds * 1_000,
      hideDashboardBeforeCapture: true
    });
    prompt.status = "captured";
    prompt.updatedAt = nowIso();
    prompt.resolvedAt = prompt.updatedAt;
    this.reminderPromptRepository.update(prompt);
    this.clearPendingPrompt(prompt.id);
    return checkpoint;
  }

  public skip(reminderPromptId: string): ReminderPromptSummary | null {
    const prompt = this.requirePrompt(reminderPromptId);
    prompt.status = "skipped";
    prompt.updatedAt = nowIso();
    prompt.resolvedAt = prompt.updatedAt;
    this.reminderPromptRepository.update(prompt);
    this.clearPendingPrompt(prompt.id);
    logInfo("Skipped reminder prompt.", { reminderPromptId });
    return null;
  }

  public snooze(reminderPromptId: string): ReminderPromptSummary {
    const prompt = this.requirePrompt(reminderPromptId);
    prompt.status = "snoozed";
    prompt.snoozeCount += 1;
    prompt.snoozedUntil = new Date(
      Date.now() + this.settingsService.getSettings().reminderSnoozeMinutes * 60_000
    ).toISOString();
    prompt.updatedAt = nowIso();
    this.reminderPromptRepository.update(prompt);
    this.pendingPrompt = null;
    this.persistPendingPrompt(null);
    patchAppState({ pendingReminderPrompt: null });
    logInfo("Snoozed reminder prompt.", { reminderPromptId, snoozedUntil: prompt.snoozedUntil });
    return toSummary(prompt);
  }

  private requirePrompt(reminderPromptId: string) {
    const prompt = this.reminderPromptRepository.findById(reminderPromptId);
    if (!prompt || (prompt.status !== "pending" && prompt.status !== "snoozed")) {
      throw new Error("Reminder prompt was not found.");
    }

    return prompt;
  }

  private clearPendingPrompt(reminderPromptId: string): void {
    if (this.pendingPrompt?.id === reminderPromptId) {
      this.pendingPrompt = null;
      this.persistPendingPrompt(null);
      patchAppState({ pendingReminderPrompt: null });
    }
  }

  private showNotification(sessionTitle: string): void {
    if (!Notification.isSupported()) {
      return;
    }

    const notification = new Notification({
      title: "SessionTrail reminder",
      body: `Ready to capture a screenshot for ${sessionTitle}.`
    });

    notification.on("click", () => {
      showDashboardWindow();
    });
    notification.show();
  }

  private persistPendingPrompt(summary: ReminderPromptSummary | null): void {
    this.runtimeStateStore.setJson(RUNTIME_STATE_KEYS.pendingReminderPrompt, summary);
  }
}
