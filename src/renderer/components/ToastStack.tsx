import { AnimatePresence, motion } from "motion/react";
import { useEffect, useEffectEvent } from "react";
import { FAST_TRANSITION } from "../motion";
import { IconLabel, XIcon } from "./animated-icons";

export type ToastTone = "error" | "warning" | "success";

export type ToastMessage = {
  id: string;
  message: string;
  tone: ToastTone;
};

type ToastStackProps = {
  toasts: ToastMessage[];
  motionEnabled: boolean;
  onDismiss: (id: string) => void;
};

function ToastCard({
  toast,
  motionEnabled,
  onDismiss
}: {
  toast: ToastMessage;
  motionEnabled: boolean;
  onDismiss: (id: string) => void;
}) {
  const dismissToast = useEffectEvent(() => onDismiss(toast.id));

  useEffect(() => {
    const timer = window.setTimeout(() => dismissToast(), 5_000);
    return () => window.clearTimeout(timer);
  }, [toast.id]);

  return (
    <motion.section
      className={`toast toast--${toast.tone}`}
      initial={motionEnabled ? { opacity: 0, y: -10, scale: 0.98 } : false}
      animate={motionEnabled ? { opacity: 1, y: 0, scale: 1 } : undefined}
      exit={motionEnabled ? { opacity: 0, y: -8, scale: 0.98 } : undefined}
      transition={motionEnabled ? FAST_TRANSITION : undefined}
      layout={motionEnabled}
    >
      <div className="toast__message">{toast.message}</div>
      <button
        type="button"
        className="button button--ghost toast__dismiss"
        onClick={() => onDismiss(toast.id)}
      >
        <IconLabel icon={XIcon} label="Dismiss" size={14} />
      </button>
    </motion.section>
  );
}

export function ToastStack({ toasts, motionEnabled, onDismiss }: ToastStackProps) {
  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="false">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <ToastCard
            key={toast.id}
            toast={toast}
            motionEnabled={motionEnabled}
            onDismiss={onDismiss}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
