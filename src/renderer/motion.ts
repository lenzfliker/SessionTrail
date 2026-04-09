import type { Transition, Variants } from "motion/react";

export const MOTION_EASE = [0.22, 1, 0.36, 1] as const;

export const FAST_TRANSITION: Transition = {
  duration: 0.18,
  ease: MOTION_EASE
};

export const STANDARD_TRANSITION: Transition = {
  duration: 0.26,
  ease: MOTION_EASE
};

export const EMPHATIC_TRANSITION: Transition = {
  duration: 0.34,
  ease: MOTION_EASE
};

export const SPRING_TRANSITION = {
  type: "spring",
  stiffness: 360,
  damping: 30,
  mass: 0.75
} as const;

export const VIEW_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 18, scale: 0.992 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: STANDARD_TRANSITION
  },
  exit: {
    opacity: 0,
    y: -12,
    scale: 0.996,
    transition: FAST_TRANSITION
  }
};

export const SURFACE_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 14, scale: 0.992 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: STANDARD_TRANSITION
  },
  exit: {
    opacity: 0,
    y: -8,
    scale: 0.996,
    transition: FAST_TRANSITION
  }
};

export const OVERLAY_VARIANTS: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: FAST_TRANSITION },
  exit: { opacity: 0, transition: FAST_TRANSITION }
};

export const DIALOG_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 24, scale: 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: EMPHATIC_TRANSITION
  },
  exit: {
    opacity: 0,
    y: 16,
    scale: 0.98,
    transition: FAST_TRANSITION
  }
};

export const STAGGER_VARIANTS: Variants = {
  hidden: {},
  visible: {
    transition: {
      delayChildren: 0.04,
      staggerChildren: 0.05
    }
  }
};

export const STAGGER_ITEM_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 10, scale: 0.99 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: STANDARD_TRANSITION
  }
};

export const CHIP_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 12, scale: 0.96 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: STANDARD_TRANSITION
  }
};
