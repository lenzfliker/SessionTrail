import type Database from "better-sqlite3";
import { RuntimeStateRepository } from "./db/repos/runtime-state-repository";
import { logWarn } from "./logger";

export const RUNTIME_STATE_KEYS = {
  pendingCheckpoint: "ui.pending_checkpoint",
  pendingReminderPrompt: "ui.pending_reminder_prompt",
  activeExportJob: "ui.active_export_job"
} as const;

export class RuntimeStateStore {
  private readonly repository: RuntimeStateRepository;

  public constructor(db: Database.Database) {
    this.repository = new RuntimeStateRepository(db);
  }

  public getJson<T>(key: string): T | null {
    const entry = this.repository.get(key);
    if (!entry) {
      return null;
    }

    try {
      return JSON.parse(entry.value) as T;
    } catch (error) {
      logWarn("Discarded invalid runtime state payload.", { key, error });
      this.repository.delete(key);
      return null;
    }
  }

  public setJson<T>(key: string, value: T | null): void {
    if (value === null) {
      this.repository.delete(key);
      return;
    }

    this.repository.set(key, JSON.stringify(value));
  }
}
