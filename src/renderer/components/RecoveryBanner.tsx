import { motion } from "motion/react";
import type { RecoverySessionSummary } from "../../shared/contracts";
import { IconLabel, PauseIcon, PlayIcon, TrashIcon } from "./animated-icons";
import { STAGGER_ITEM_VARIANTS, STAGGER_VARIANTS, SURFACE_VARIANTS } from "../motion";

type RecoveryBannerProps = {
  recovery: RecoverySessionSummary;
  busy: boolean;
  motionEnabled: boolean;
  onResume: () => void;
  onLeavePaused: () => void;
  onEndSession: () => void;
};

export function RecoveryBanner({
  recovery,
  busy,
  motionEnabled,
  onResume,
  onLeavePaused,
  onEndSession
}: RecoveryBannerProps) {
  return (
    <motion.section
      className="panel panel--attention"
      layout={motionEnabled}
      initial={motionEnabled ? "hidden" : false}
      animate="visible"
      exit={motionEnabled ? "exit" : undefined}
      variants={SURFACE_VARIANTS}
    >
      <div className="panel__header">
        <h2>Recovery required</h2>
        <span className="badge">startup</span>
      </div>
      <motion.p
        initial={motionEnabled ? "hidden" : false}
        animate="visible"
        variants={STAGGER_ITEM_VARIANTS}
      >
        {recovery.session.title} ended uncleanly and is ready for recovery action.
      </motion.p>
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
          onClick={onResume}
          variants={STAGGER_ITEM_VARIANTS}
          whileTap={motionEnabled ? { scale: 0.985 } : undefined}
        >
          <IconLabel icon={PlayIcon} label="Resume" />
        </motion.button>
        <motion.button
          type="button"
          className="button button--ghost"
          disabled={busy}
          onClick={onLeavePaused}
          variants={STAGGER_ITEM_VARIANTS}
          whileTap={motionEnabled ? { scale: 0.985 } : undefined}
        >
          <IconLabel icon={PauseIcon} label="Leave paused" />
        </motion.button>
        <motion.button
          type="button"
          className="button button--danger"
          disabled={busy}
          onClick={onEndSession}
          variants={STAGGER_ITEM_VARIANTS}
          whileTap={motionEnabled ? { scale: 0.985 } : undefined}
        >
          <IconLabel icon={TrashIcon} label="End session" />
        </motion.button>
      </motion.div>
    </motion.section>
  );
}
