import { motion } from "motion/react";
import type { ReminderPromptSummary } from "../../shared/contracts";
import { BellIcon, ChevronRightIcon, IconLabel, MonitorCheckIcon } from "./animated-icons";
import { STAGGER_ITEM_VARIANTS, STAGGER_VARIANTS, SURFACE_VARIANTS } from "../motion";
import { formatDuration } from "../utils";

type ReminderBannerProps = {
  prompt: ReminderPromptSummary;
  busy: boolean;
  snoozeMinutes: number;
  motionEnabled: boolean;
  onTakeScreenshot: () => void;
  onSnooze: () => void;
  onSkip: () => void;
};

export function ReminderBanner({
  prompt,
  busy,
  snoozeMinutes,
  motionEnabled,
  onTakeScreenshot,
  onSnooze,
  onSkip
}: ReminderBannerProps) {
  return (
    <motion.section
      className="overlay-card"
      layout={motionEnabled}
      initial={motionEnabled ? "hidden" : false}
      animate="visible"
      exit={motionEnabled ? "exit" : undefined}
      variants={SURFACE_VARIANTS}
    >
      <motion.div
        initial={motionEnabled ? "hidden" : false}
        animate="visible"
        variants={STAGGER_ITEM_VARIANTS}
      >
        <strong>Reminder ready</strong>
        <div>Reached {formatDuration(prompt.workedOffsetSeconds)} worked time. Capture only when you are ready.</div>
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
          disabled={busy}
          onClick={onTakeScreenshot}
          variants={STAGGER_ITEM_VARIANTS}
          whileTap={motionEnabled ? { scale: 0.985 } : undefined}
        >
          <IconLabel icon={MonitorCheckIcon} label="Take screenshot" />
        </motion.button>
        <motion.button
          type="button"
          className="button button--ghost"
          disabled={busy}
          onClick={onSnooze}
          variants={STAGGER_ITEM_VARIANTS}
          whileTap={motionEnabled ? { scale: 0.985 } : undefined}
        >
          <IconLabel icon={BellIcon} label={`Snooze ${snoozeMinutes} min`} />
        </motion.button>
        <motion.button
          type="button"
          className="button button--ghost"
          disabled={busy}
          onClick={onSkip}
          variants={STAGGER_ITEM_VARIANTS}
          whileTap={motionEnabled ? { scale: 0.985 } : undefined}
        >
          <IconLabel icon={ChevronRightIcon} label="Skip" />
        </motion.button>
      </motion.div>
    </motion.section>
  );
}
