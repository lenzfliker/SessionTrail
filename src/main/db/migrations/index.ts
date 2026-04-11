import { migration001Init } from "./001-init";
import { migration002RuntimeState } from "./002-runtime-state";
import { migration003V2InteractionExport } from "./003-v2-interaction-export";
import { migration004FixSessionForeignKeys } from "./004-fix-session-foreign-keys";
import { migration005ExportOutputPath } from "./005-export-output-path";
import { migration006ReminderSnoozeCount } from "./006-reminder-snooze-count";
import { migration007ImportedMediaVisualSources } from "./007-imported-media-visual-sources";

export type MigrationDefinition = {
  id: string;
  sql: string;
};

export const migrations: MigrationDefinition[] = [
  {
    id: "001-init",
    sql: migration001Init
  },
  {
    id: "002-runtime-state",
    sql: migration002RuntimeState
  },
  {
    id: "003-v2-interaction-export",
    sql: migration003V2InteractionExport
  },
  {
    id: "004-fix-session-foreign-keys",
    sql: migration004FixSessionForeignKeys
  },
  {
    id: "005-export-output-path",
    sql: migration005ExportOutputPath
  },
  {
    id: "006-reminder-snooze-count",
    sql: migration006ReminderSnoozeCount
  },
  {
    id: "007-imported-media-visual-sources",
    sql: migration007ImportedMediaVisualSources
  }
];
