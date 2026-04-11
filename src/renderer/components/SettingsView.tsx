import { useState } from "react";
import { motion } from "motion/react";
import type { AppSettings, SnailPetScale, SnailPetSpeed, UpdateSettingsInput } from "../../shared/contracts";
import {
  AudioLinesIcon,
  CheckIcon,
  ClockIcon,
  EyeIcon,
  EyeOffIcon,
  IconLabel,
  LogOutIcon,
  MonitorCheckIcon,
} from "./animated-icons";
import { STAGGER_ITEM_VARIANTS, STAGGER_VARIANTS } from "../motion";

// ─── Helper components ───────────────────────────────────────────────────────

function PillToggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={"pill-toggle" + (checked ? " pill-toggle--on" : "")}
      onClick={() => onChange(!checked)}
    >
      <span className="pill-toggle__thumb" />
    </button>
  );
}

function SettingRow({
  label,
  children,
  htmlFor,
}: {
  label: string;
  children: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <label className="setting-row" htmlFor={htmlFor}>
      <span className="setting-row__label">{label}</span>
      <div className="setting-row__control">{children}</div>
    </label>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  // Must be <div>, not <label> — nesting <button> inside <label> double-fires click
  return (
    <div className="setting-row">
      <span className="setting-row__label">{label}</span>
      <PillToggle checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  );
}

function SectionCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <motion.div className="settings-card" variants={STAGGER_ITEM_VARIANTS}>
      <div className="settings-card__header">
        <span className="settings-card__icon">{icon}</span>
        <h3 className="settings-card__title">{title}</h3>
      </div>
      <div className="settings-card__body">{children}</div>
    </motion.div>
  );
}

// ─── Pet Wizard ──────────────────────────────────────────────────────────────

type PetWizardProps = {
  settings: AppSettings;
  draft: UpdateSettingsInput;
  busy: boolean;
  onChange: (patch: UpdateSettingsInput) => void;
  onSnailEnabledChange: (enabled: boolean) => void;
  onSnailSpeedChange: (speed: SnailPetSpeed) => void;
  onSnailScaleChange: (scale: SnailPetScale) => void;
  snailCalibrationOpen: boolean;
  snailCalibrationScale: SnailPetScale;
  snailCalibrationDraftInsetPx: number;
  onSnailCalibrationInsetChange: (insetPx: number) => void;
  onApplySnailCalibration: () => void;
  onCancelSnailCalibration: () => void;
  onRecalibrateSnail: () => void;
};

function PetWizard({
  settings,
  draft,
  busy,
  onChange,
  onSnailEnabledChange,
  onSnailSpeedChange,
  onSnailScaleChange,
  snailCalibrationOpen,
  snailCalibrationScale,
  snailCalibrationDraftInsetPx,
  onSnailCalibrationInsetChange,
  onApplySnailCalibration,
  onCancelSnailCalibration,
  onRecalibrateSnail,
}: PetWizardProps) {
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  // Parent-controlled calibration open state always wins and forces step 2
  const activeStep = snailCalibrationOpen ? 2 : step;
  const petEnabled = Boolean(draft.snailPetEnabled ?? settings.snailPetEnabled);
  const currentScale = draft.snailPetScale ?? settings.snailPetScale;
  const currentSpeed = draft.snailPetSpeed ?? settings.snailPetSpeed;
  const visibleSpeed = currentSpeed === "hyper" ? "hyper" : "low";
  const insetProfile = draft.snailPetInsetProfile ?? settings.snailPetInsetProfile;

  return (
    <motion.div className="pet-wizard" variants={STAGGER_ITEM_VARIANTS}>
      {/* Header: emoji + title + step dots */}
      <div className="pet-wizard__header">
        <span className="pet-wizard__emoji">🐌</span>
        <h3 className="pet-wizard__title">Snail Pet</h3>
        <div className="pet-wizard__dots">
          {([0, 1, 2, 3] as const).map((i) => (
            <button
              key={i}
              type="button"
              disabled={snailCalibrationOpen}
              className={"pet-wizard__dot" + (activeStep === i ? " pet-wizard__dot--active" : "")}
              onClick={() => setStep(i)}
              aria-label={`Step ${i + 1}`}
            />
          ))}
        </div>
      </div>

      {/* Step 0: Enable */}
      {activeStep === 0 && (
        <div className="pet-wizard__body pet-wizard__step">
          <p className="pet-wizard__desc">
            A tiny snail lives on the edge of your screen and keeps you company while you work! 🎉
          </p>
          <ToggleRow
            label="Enable desktop snail"
            checked={petEnabled}
            onChange={onSnailEnabledChange}
          />
        </div>
      )}

      {/* Step 1: Size */}
      {activeStep === 1 && (
        <div className="pet-wizard__body pet-wizard__step">
          <p className="pet-wizard__desc">How big should your snail be?</p>
          <div className="setting-row">
            <span className="setting-row__label">Size</span>
            <div className="pet-wizard__pill-group">
              {([2, 3, 4] as const).map((scale) => (
                <button
                  key={scale}
                  type="button"
                  disabled={!petEnabled}
                  className={
                    "pet-wizard__pill-btn" +
                    (currentScale === scale ? " pet-wizard__pill-btn--active" : "")
                  }
                  onClick={() => onSnailScaleChange(scale)}
                >
                  {scale}x
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Calibrate — reuses existing .settings-calibration__* CSS */}
      {activeStep === 2 && (
        <div className="pet-wizard__body pet-wizard__step">
          <div className="settings-calibration__summary">
            <span>
              Current {String(currentScale)}x inset: {insetProfile[currentScale]}px
            </span>
            {!snailCalibrationOpen && (
              <button
                type="button"
                className="button button--ghost"
                disabled={!petEnabled}
                onClick={onRecalibrateSnail}
              >
                Calibrate Alignment
              </button>
            )}
          </div>
          {snailCalibrationOpen && (
            <div className="settings-calibration__panel">
              <strong>Calibrate {snailCalibrationScale}x alignment</strong>
              <span>Move the slider until the snail looks attached to the screen edge.</span>
              <span>
                This only changes the {snailCalibrationScale}x inset; other sizes keep their own
                saved values.
              </span>
              <span className="settings-calibration__values">
                Saved: 2x {insetProfile[2]}px, 3x {insetProfile[3]}px, 4x {insetProfile[4]}px
              </span>
              <label className="field">
                <span>
                  Inset for {snailCalibrationScale}x ({snailCalibrationDraftInsetPx}px)
                </span>
                <input
                  type="range"
                  min="0"
                  max="24"
                  step="1"
                  value={String(snailCalibrationDraftInsetPx)}
                  onChange={(e) => onSnailCalibrationInsetChange(Number(e.target.value))}
                />
              </label>
              <div className="settings-calibration__actions">
                <button
                  type="button"
                  className="button"
                  disabled={busy}
                  onClick={onApplySnailCalibration}
                >
                  Apply
                </button>
                <button
                  type="button"
                  className="button button--ghost"
                  disabled={busy}
                  onClick={onCancelSnailCalibration}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 3: Speed */}
      {activeStep === 3 && (
        <div className="pet-wizard__body pet-wizard__step">
          <p className="pet-wizard__desc">How fast should your snail zip around?</p>
          <div className="setting-row">
            <span className="setting-row__label">Speed</span>
            <div className="pet-wizard__pill-group">
              {(
                ["low", "hyper"] as const
              ).map((speed, i) => (
                <button
                  key={speed}
                  type="button"
                  disabled={!petEnabled}
                  className={
                    "pet-wizard__pill-btn" +
                    (visibleSpeed === speed ? " pet-wizard__pill-btn--active" : "")
                  }
                  onClick={() => onSnailSpeedChange(speed)}
                >
                  {(["Snail", "Turbo"] as const)[i]}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Navigation: Back | Next */}
      <div className="pet-wizard__nav">
        <button
          type="button"
          className="button button--ghost"
          disabled={activeStep === 0 || snailCalibrationOpen}
          onClick={() => setStep((s) => (Math.max(0, s - 1) as 0 | 1 | 2 | 3))}
        >
          Back
        </button>
        <button
          type="button"
          className="button"
          disabled={activeStep === 3 || snailCalibrationOpen}
          onClick={() => setStep((s) => (Math.min(3, s + 1) as 0 | 1 | 2 | 3))}
        >
          Next
        </button>
      </div>
    </motion.div>
  );
}

// ─── Main Settings View ──────────────────────────────────────────────────────

type SettingsViewProps = {
  settings: AppSettings;
  draft: UpdateSettingsInput;
  busy: boolean;
  motionEnabled: boolean;
  onChange: (patch: UpdateSettingsInput) => void;
  onSnailEnabledChange: (enabled: boolean) => void;
  onSnailSpeedChange: (speed: SnailPetSpeed) => void;
  onSnailScaleChange: (scale: SnailPetScale) => void;
  snailCalibrationOpen: boolean;
  snailCalibrationScale: SnailPetScale;
  snailCalibrationDraftInsetPx: number;
  onSnailCalibrationInsetChange: (insetPx: number) => void;
  onApplySnailCalibration: () => void;
  onCancelSnailCalibration: () => void;
  onRecalibrateSnail: () => void;
  onChooseExportDirectory: () => Promise<string | null>;
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
  onSnailEnabledChange,
  onSnailSpeedChange,
  onSnailScaleChange,
  snailCalibrationOpen,
  snailCalibrationScale,
  snailCalibrationDraftInsetPx,
  onSnailCalibrationInsetChange,
  onApplySnailCalibration,
  onCancelSnailCalibration,
  onRecalibrateSnail,
  onChooseExportDirectory,
  onSave,
  onShow,
  onHide,
  onQuit,
}: SettingsViewProps) {
  return (
    <>
      <div className="panel__header">
        <h2>Settings</h2>
        <span className="badge">{settings.theme}</span>
      </div>

      <motion.div
        className="settings-sections"
        initial={motionEnabled ? "hidden" : false}
        animate="visible"
        variants={STAGGER_VARIANTS}
      >
        {/* Sessions */}
        <SectionCard title="Sessions" icon={<ClockIcon size={15} />}>
          <SettingRow label="Reminder interval" htmlFor="s-reminder-interval">
            <input
              id="s-reminder-interval"
              type="number"
              min="1"
              max="120"
              value={String(draft.reminderIntervalMinutes ?? settings.reminderIntervalMinutes)}
              onChange={(e) => onChange({ reminderIntervalMinutes: Number(e.target.value) })}
            />
          </SettingRow>
          <SettingRow label="Default session target" htmlFor="s-default-target">
            <input
              id="s-default-target"
              type="number"
              min="1"
              max="720"
              value={String(draft.defaultTargetMinutes ?? settings.defaultTargetMinutes)}
              onChange={(e) => onChange({ defaultTargetMinutes: Number(e.target.value) })}
            />
          </SettingRow>
          <SettingRow label="Capture delay" htmlFor="s-capture-delay">
            <input
              id="s-capture-delay"
              type="number"
              min="0"
              max="10"
              value={String(draft.captureDelaySeconds ?? settings.captureDelaySeconds)}
              onChange={(e) => onChange({ captureDelaySeconds: Number(e.target.value) })}
            />
          </SettingRow>
          <SettingRow label="Snooze duration" htmlFor="s-snooze">
            <input
              id="s-snooze"
              type="number"
              min="1"
              max="30"
              value={String(draft.reminderSnoozeMinutes ?? settings.reminderSnoozeMinutes)}
              onChange={(e) => onChange({ reminderSnoozeMinutes: Number(e.target.value) })}
            />
          </SettingRow>
          <SettingRow label="Daily reflect goal" htmlFor="s-reflect-goal">
            <input
              id="s-reflect-goal"
              type="number"
              min="1"
              max="1440"
              value={String(draft.reflectDailyGoalMinutes ?? settings.reflectDailyGoalMinutes)}
              onChange={(e) => onChange({ reflectDailyGoalMinutes: Number(e.target.value) })}
            />
          </SettingRow>
        </SectionCard>

        {/* App */}
        <SectionCard title="App" icon={<MonitorCheckIcon size={15} />}>
          <SettingRow label="Export directory" htmlFor="s-export-dir">
            <input
              id="s-export-dir"
              type="text"
              value={draft.defaultExportDirectory ?? settings.defaultExportDirectory}
              onChange={(e) => onChange({ defaultExportDirectory: e.target.value })}
            />
            <button
              type="button"
              className="button button--ghost setting-row__browse-btn"
              onClick={() =>
                void onChooseExportDirectory().then((dir) => {
                  if (dir) onChange({ defaultExportDirectory: dir });
                })
              }
            >
              Browse…
            </button>
          </SettingRow>
          <SettingRow label="Startup behavior" htmlFor="s-startup">
            <select
              id="s-startup"
              value={draft.startupDashboardBehavior ?? settings.startupDashboardBehavior}
              onChange={(e) =>
                onChange({
                  startupDashboardBehavior: e.target.value as AppSettings["startupDashboardBehavior"],
                })
              }
            >
              <option value="tray_only">Tray only</option>
              <option value="show_dashboard">Show dashboard</option>
            </select>
          </SettingRow>
          <ToggleRow
            label="Launch at login"
            checked={Boolean(draft.launchAtLogin ?? settings.launchAtLogin)}
            onChange={(v) => onChange({ launchAtLogin: v })}
          />
          <ToggleRow
            label="Open dashboard on reminder"
            checked={Boolean(draft.openDashboardOnReminder ?? settings.openDashboardOnReminder)}
            onChange={(v) => onChange({ openDashboardOnReminder: v })}
          />
        </SectionCard>

        {/* Interface */}
        <SectionCard title="Interface" icon={<AudioLinesIcon size={15} />}>
          <ToggleRow
            label="UI sounds"
            checked={Boolean(draft.uiSoundsEnabled ?? settings.uiSoundsEnabled)}
            onChange={(v) => onChange({ uiSoundsEnabled: v })}
          />
          <ToggleRow
            label="UI motion"
            checked={Boolean(draft.uiMotionEnabled ?? settings.uiMotionEnabled)}
            onChange={(v) => onChange({ uiMotionEnabled: v })}
          />
        </SectionCard>

        {/* Snail Pet Wizard */}
        <PetWizard
          settings={settings}
          draft={draft}
          busy={busy}
          onChange={onChange}
          onSnailEnabledChange={onSnailEnabledChange}
          onSnailSpeedChange={onSnailSpeedChange}
          onSnailScaleChange={onSnailScaleChange}
          snailCalibrationOpen={snailCalibrationOpen}
          snailCalibrationScale={snailCalibrationScale}
          snailCalibrationDraftInsetPx={snailCalibrationDraftInsetPx}
          onSnailCalibrationInsetChange={onSnailCalibrationInsetChange}
          onApplySnailCalibration={onApplySnailCalibration}
          onCancelSnailCalibration={onCancelSnailCalibration}
          onRecalibrateSnail={onRecalibrateSnail}
        />
      </motion.div>

      <motion.div
        className="button-row"
        initial={motionEnabled ? "hidden" : false}
        animate="visible"
        variants={STAGGER_VARIANTS}
      >
        <motion.button
          type="button"
          className="button"
          disabled={busy || snailCalibrationOpen}
          onClick={onSave}
          variants={STAGGER_ITEM_VARIANTS}
        >
          <IconLabel icon={CheckIcon} label="Save settings" />
        </motion.button>
        <motion.button
          type="button"
          className="button button--ghost"
          onClick={onShow}
          variants={STAGGER_ITEM_VARIANTS}
        >
          <IconLabel icon={EyeIcon} label="Show" />
        </motion.button>
        <motion.button
          type="button"
          className="button button--ghost"
          onClick={onHide}
          variants={STAGGER_ITEM_VARIANTS}
        >
          <IconLabel icon={EyeOffIcon} label="Hide" />
        </motion.button>
        <motion.button
          type="button"
          className="button button--danger"
          onClick={onQuit}
          variants={STAGGER_ITEM_VARIANTS}
        >
          <IconLabel icon={LogOutIcon} label="Quit" />
        </motion.button>
      </motion.div>
    </>
  );
}
