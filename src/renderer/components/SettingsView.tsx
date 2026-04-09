import { motion } from "motion/react";
import type { AppSettings, UpdateSettingsInput } from "../../shared/contracts";
import { CheckIcon, EyeIcon, EyeOffIcon, IconLabel, LogOutIcon } from "./animated-icons";
import { STAGGER_ITEM_VARIANTS, STAGGER_VARIANTS } from "../motion";

type SettingsViewProps = {
  settings: AppSettings;
  draft: UpdateSettingsInput;
  busy: boolean;
  motionEnabled: boolean;
  onChange: (patch: UpdateSettingsInput) => void;
  onSave: () => void;
  onShow: () => void;
  onHide: () => void;
  onQuit: () => void;
};

export function SettingsView({
  settings,
  draft,
  busy,
  motionEnabled,
  onChange,
  onSave,
  onShow,
  onHide,
  onQuit
}: SettingsViewProps) {
  return (
    <>
      <div className="panel__header">
        <h2>Settings</h2>
        <span className="badge">{settings.theme}</span>
      </div>
      <motion.div
        className="form-grid"
        initial={motionEnabled ? "hidden" : false}
        animate="visible"
        variants={STAGGER_VARIANTS}
      >
        <motion.label className="field" variants={STAGGER_ITEM_VARIANTS}>
          <span>Reminder interval minutes</span>
          <input type="number" min="1" max="120" value={String(draft.reminderIntervalMinutes ?? settings.reminderIntervalMinutes)} onChange={(event) => onChange({ reminderIntervalMinutes: Number(event.target.value) })} />
        </motion.label>
        <motion.label className="field" variants={STAGGER_ITEM_VARIANTS}>
          <span>Default session target minutes</span>
          <input type="number" min="1" max="720" value={String(draft.defaultTargetMinutes ?? settings.defaultTargetMinutes)} onChange={(event) => onChange({ defaultTargetMinutes: Number(event.target.value) })} />
        </motion.label>
        <motion.label className="field" variants={STAGGER_ITEM_VARIANTS}>
          <span>Capture delay seconds</span>
          <input type="number" min="0" max="10" value={String(draft.captureDelaySeconds ?? settings.captureDelaySeconds)} onChange={(event) => onChange({ captureDelaySeconds: Number(event.target.value) })} />
        </motion.label>
        <motion.label className="field" variants={STAGGER_ITEM_VARIANTS}>
          <span>Reminder snooze minutes</span>
          <input type="number" min="1" max="30" value={String(draft.reminderSnoozeMinutes ?? settings.reminderSnoozeMinutes)} onChange={(event) => onChange({ reminderSnoozeMinutes: Number(event.target.value) })} />
        </motion.label>
        <motion.label className="field" variants={STAGGER_ITEM_VARIANTS}>
          <span>Default export directory</span>
          <input value={draft.defaultExportDirectory ?? settings.defaultExportDirectory} onChange={(event) => onChange({ defaultExportDirectory: event.target.value })} />
        </motion.label>
        <motion.label className="field" variants={STAGGER_ITEM_VARIANTS}>
          <span>Startup behavior</span>
          <select value={draft.startupDashboardBehavior ?? settings.startupDashboardBehavior} onChange={(event) => onChange({ startupDashboardBehavior: event.target.value as AppSettings["startupDashboardBehavior"] })}>
            <option value="tray_only">Tray only</option>
            <option value="show_dashboard">Show dashboard</option>
          </select>
        </motion.label>
        <motion.label className="field checkbox-field" variants={STAGGER_ITEM_VARIANTS}>
          <span>Launch at login</span>
          <input type="checkbox" checked={Boolean(draft.launchAtLogin ?? settings.launchAtLogin)} onChange={(event) => onChange({ launchAtLogin: event.target.checked })} />
        </motion.label>
        <motion.label className="field checkbox-field" variants={STAGGER_ITEM_VARIANTS}>
          <span>Open dashboard on reminder</span>
          <input type="checkbox" checked={Boolean(draft.openDashboardOnReminder ?? settings.openDashboardOnReminder)} onChange={(event) => onChange({ openDashboardOnReminder: event.target.checked })} />
        </motion.label>
        <motion.label className="field checkbox-field" variants={STAGGER_ITEM_VARIANTS}>
          <span>UI sounds</span>
          <input type="checkbox" checked={Boolean(draft.uiSoundsEnabled ?? settings.uiSoundsEnabled)} onChange={(event) => onChange({ uiSoundsEnabled: event.target.checked })} />
        </motion.label>
        <motion.label className="field checkbox-field" variants={STAGGER_ITEM_VARIANTS}>
          <span>UI motion</span>
          <input type="checkbox" checked={Boolean(draft.uiMotionEnabled ?? settings.uiMotionEnabled)} onChange={(event) => onChange({ uiMotionEnabled: event.target.checked })} />
        </motion.label>
      </motion.div>
      <motion.div
        className="button-row"
        initial={motionEnabled ? "hidden" : false}
        animate="visible"
        variants={STAGGER_VARIANTS}
      >
        <motion.button type="button" className="button" disabled={busy} onClick={onSave} variants={STAGGER_ITEM_VARIANTS}><IconLabel icon={CheckIcon} label="Save settings" /></motion.button>
        <motion.button type="button" className="button button--ghost" onClick={onShow} variants={STAGGER_ITEM_VARIANTS}><IconLabel icon={EyeIcon} label="Show" /></motion.button>
        <motion.button type="button" className="button button--ghost" onClick={onHide} variants={STAGGER_ITEM_VARIANTS}><IconLabel icon={EyeOffIcon} label="Hide" /></motion.button>
        <motion.button type="button" className="button button--danger" onClick={onQuit} variants={STAGGER_ITEM_VARIANTS}><IconLabel icon={LogOutIcon} label="Quit" /></motion.button>
      </motion.div>
    </>
  );
}
