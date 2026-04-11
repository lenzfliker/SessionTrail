import { createContext, type ComponentType, type ReactNode, useContext, useId, useState } from "react";
import { motion } from "motion/react";
import { FAST_TRANSITION, STANDARD_TRANSITION } from "../motion";

export type AnimatedIconProps = {
  className?: string;
  size?: number;
  strokeWidth?: number;
  active?: boolean;
  title?: string;
};

type IconRenderProps = {
  animate: boolean;
  strokeWidth: number;
  id: string;
};

type AnimatedIconBaseProps = AnimatedIconProps & {
  children: (props: IconRenderProps) => ReactNode;
};

const IconMotionContext = createContext(true);

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function AnimatedIconProvider({
  enabled,
  children
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  return <IconMotionContext.Provider value={enabled}>{children}</IconMotionContext.Provider>;
}

function useIconMotionEnabled() {
  return useContext(IconMotionContext);
}

function AnimatedIconBase({
  className,
  size = 18,
  strokeWidth = 1.85,
  active = false,
  title,
  children
}: AnimatedIconBaseProps) {
  const motionEnabled = useIconMotionEnabled();
  const [hovered, setHovered] = useState(false);
  const animate = motionEnabled && (hovered || active);
  const id = useId().replace(/:/g, "");

  return (
    <motion.span
      className={cx("ui-icon", className)}
      style={{ width: size, height: size }}
      onHoverStart={motionEnabled ? () => setHovered(true) : undefined}
      onHoverEnd={motionEnabled ? () => setHovered(false) : undefined}
      whileTap={motionEnabled ? { scale: 0.94 } : undefined}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        role={title ? "img" : "presentation"}
        aria-hidden={title ? undefined : true}
        aria-label={title}
      >
        {children({ animate, strokeWidth, id })}
      </svg>
    </motion.span>
  );
}

export type AnimatedIconComponent = ComponentType<AnimatedIconProps>;

export function IconLabel({
  icon: Icon,
  label,
  active = false,
  className,
  size = 18,
  labelClassName
}: {
  icon: AnimatedIconComponent;
  label: ReactNode;
  active?: boolean;
  className?: string;
  size?: number;
  labelClassName?: string;
}) {
  const motionEnabled = useIconMotionEnabled();
  const [hovered, setHovered] = useState(false);

  return (
    <motion.span
      className={cx("icon-label", className)}
      onHoverStart={motionEnabled ? () => setHovered(true) : undefined}
      onHoverEnd={motionEnabled ? () => setHovered(false) : undefined}
    >
      <Icon className="icon-label__icon" size={size} active={active || hovered} />
      <span className={cx("icon-label__text", labelClassName)}>{label}</span>
    </motion.span>
  );
}

export function IconGlyph({
  icon: Icon,
  active = false,
  className,
  size = 18
}: {
  icon: AnimatedIconComponent;
  active?: boolean;
  className?: string;
  size?: number;
}) {
  const motionEnabled = useIconMotionEnabled();
  const [hovered, setHovered] = useState(false);

  return (
    <motion.span
      className={cx("icon-glyph", className)}
      onHoverStart={motionEnabled ? () => setHovered(true) : undefined}
      onHoverEnd={motionEnabled ? () => setHovered(false) : undefined}
    >
      <Icon size={size} active={active || hovered} />
    </motion.span>
  );
}

export function ClockIcon(props: AnimatedIconProps) {
  return (
    <AnimatedIconBase {...props}>
      {({ animate }) => (
        <>
          <circle cx="12" cy="12" r="8.5" />
          <motion.g
            initial={false}
            animate={animate ? { rotate: 20 } : { rotate: 0 }}
            transition={STANDARD_TRANSITION}
            style={{ originX: "50%", originY: "50%" }}
          >
            <path d="M12 7.6v4.8l3.1 1.9" />
          </motion.g>
        </>
      )}
    </AnimatedIconBase>
  );
}

export function GalleryIcon(props: AnimatedIconProps) {
  return (
    <AnimatedIconBase {...props}>
      {({ animate }) => (
        <>
          <rect x="3.5" y="5" width="17" height="14.5" rx="2.75" />
          <motion.rect
            x="6.5"
            y="8"
            width="4.5"
            height="8"
            rx="1.25"
            initial={false}
            animate={animate ? { x: 5.8 } : { x: 6.5 }}
            transition={FAST_TRANSITION}
          />
          <motion.rect
            x="13"
            y="8"
            width="4.5"
            height="8"
            rx="1.25"
            initial={false}
            animate={animate ? { x: 13.7 } : { x: 13 }}
            transition={FAST_TRANSITION}
          />
        </>
      )}
    </AnimatedIconBase>
  );
}

export function PulseIcon(props: AnimatedIconProps) {
  return (
    <AnimatedIconBase {...props}>
      {({ animate }) => (
        <>
          <path d="M4.5 19.2h15" />
          {[7.5, 12, 16.5].map((x, index) => (
            <motion.path
              key={x}
              d={`M${x} ${18 - (index + 1) * 3.6}V18`}
              initial={false}
              animate={animate
                ? { scaleY: [0.86, 1.18, 0.92, 1], y: [0.4, -0.9, 0.2, 0] }
                : { scaleY: 1, y: 0 }}
              transition={animate
                ? {
                    duration: 0.86,
                    ease: "easeInOut",
                    repeat: Number.POSITIVE_INFINITY,
                    repeatType: "mirror",
                    delay: index * 0.08
                  }
                : FAST_TRANSITION}
              style={{ originX: "50%", originY: "100%" }}
            />
          ))}
        </>
      )}
    </AnimatedIconBase>
  );
}

export function SettingsIcon(props: AnimatedIconProps) {
  return (
    <AnimatedIconBase {...props}>
      {({ animate }) => (
        <>
          <motion.g
            initial={false}
            animate={animate ? { rotate: 30 } : { rotate: 0 }}
            transition={STANDARD_TRANSITION}
            style={{ originX: "50%", originY: "50%" }}
          >
            <path d="M12 3.8v2.2" />
            <path d="M12 18v2.2" />
            <path d="m5.7 5.7 1.55 1.55" />
            <path d="m16.75 16.75 1.55 1.55" />
            <path d="M3.8 12H6" />
            <path d="M18 12h2.2" />
            <path d="m5.7 18.3 1.55-1.55" />
            <path d="m16.75 7.25 1.55-1.55" />
            <circle cx="12" cy="12" r="3.2" />
          </motion.g>
        </>
      )}
    </AnimatedIconBase>
  );
}

export function PlayIcon(props: AnimatedIconProps) {
  return (
    <AnimatedIconBase {...props}>
      {({ animate }) => (
        <motion.path
          d="M8 6.2v11.6L17.5 12 8 6.2Z"
          initial={false}
          animate={animate ? { x: 0.8, scale: 1.03 } : { x: 0, scale: 1 }}
          transition={FAST_TRANSITION}
          style={{ originX: "50%", originY: "50%" }}
        />
      )}
    </AnimatedIconBase>
  );
}

export function PauseIcon(props: AnimatedIconProps) {
  return (
    <AnimatedIconBase {...props}>
      {({ animate }) => (
        <>
          <motion.path
            d="M9 7v10"
            initial={false}
            animate={animate ? { scaleY: 1.08, y: -0.15 } : { scaleY: 1, y: 0 }}
            transition={FAST_TRANSITION}
            style={{ originX: "50%", originY: "50%" }}
          />
          <motion.path
            d="M15 7v10"
            initial={false}
            animate={animate ? { scaleY: 1.08, y: -0.15 } : { scaleY: 1, y: 0 }}
            transition={FAST_TRANSITION}
            style={{ originX: "50%", originY: "50%" }}
          />
        </>
      )}
    </AnimatedIconBase>
  );
}

export function CheckIcon(props: AnimatedIconProps) {
  return (
    <AnimatedIconBase {...props}>
      {({ animate }) => (
        <motion.path
          d="m5.5 12.7 4.2 4.2L18.5 8"
          initial={false}
          animate={animate ? { scale: 1.04, y: -0.2 } : { scale: 1, y: 0 }}
          transition={FAST_TRANSITION}
          style={{ originX: "50%", originY: "50%" }}
        />
      )}
    </AnimatedIconBase>
  );
}

export function TrashIcon(props: AnimatedIconProps) {
  return (
    <AnimatedIconBase {...props}>
      {({ animate }) => (
        <>
          <motion.path
            d="M4.5 7.5h15"
            initial={false}
            animate={animate ? { y: -0.4 } : { y: 0 }}
            transition={FAST_TRANSITION}
          />
          <motion.path
            d="M9.5 4.5h5l1 2.5h-7Z"
            initial={false}
            animate={animate ? { rotate: -8, y: -0.4 } : { rotate: 0, y: 0 }}
            transition={FAST_TRANSITION}
            style={{ originX: "50%", originY: "35%" }}
          />
          <path d="M7.5 7.5v9a2 2 0 0 0 2 2h5a2 2 0 0 0 2-2v-9" />
          <path d="M10 10.5v5.5" />
          <path d="M14 10.5v5.5" />
        </>
      )}
    </AnimatedIconBase>
  );
}

export function BookmarkPlusIcon(props: AnimatedIconProps) {
  return (
    <AnimatedIconBase {...props}>
      {({ animate }) => (
        <>
          <path d="M7 4.2h10a1.8 1.8 0 0 1 1.8 1.8v13.8l-6.8-4.1-6.8 4.1V6A1.8 1.8 0 0 1 7 4.2Z" />
          <motion.g
            initial={false}
            animate={animate ? { rotate: 90, scale: 1.04 } : { rotate: 0, scale: 1 }}
            transition={FAST_TRANSITION}
            style={{ originX: "62.5%", originY: "37.5%" }}
          >
            <path d="M12 7.5v5" />
            <path d="M9.5 10h5" />
          </motion.g>
        </>
      )}
    </AnimatedIconBase>
  );
}

export function MicIcon(props: AnimatedIconProps) {
  return (
    <AnimatedIconBase {...props}>
      {({ animate }) => (
        <>
          <motion.rect
            x="9"
            y="4"
            width="6"
            height="10"
            rx="3"
            initial={false}
            animate={animate ? { y: 3.3 } : { y: 4 }}
            transition={FAST_TRANSITION}
          />
          <path d="M7 11.5a5 5 0 0 0 10 0" />
          <path d="M12 16.5v3.5" />
          <path d="M9.2 20h5.6" />
        </>
      )}
    </AnimatedIconBase>
  );
}

export function RadioIcon(props: AnimatedIconProps) {
  return (
    <AnimatedIconBase {...props}>
      {({ animate }) => (
        <>
          <circle cx="12" cy="12" r="2.1" />
          <motion.path
            d="M8 8a5.6 5.6 0 0 0 0 8"
            initial={false}
            animate={animate ? { scale: 1.08 } : { scale: 1 }}
            transition={FAST_TRANSITION}
            style={{ originX: "50%", originY: "50%" }}
          />
          <motion.path
            d="M16 8a5.6 5.6 0 0 1 0 8"
            initial={false}
            animate={animate ? { scale: 1.08 } : { scale: 1 }}
            transition={FAST_TRANSITION}
            style={{ originX: "50%", originY: "50%" }}
          />
          <motion.path
            d="M5.4 5.4a9.4 9.4 0 0 0 0 13.2"
            initial={false}
            animate={animate ? { opacity: 1 } : { opacity: 0.72 }}
            transition={FAST_TRANSITION}
          />
          <motion.path
            d="M18.6 5.4a9.4 9.4 0 0 1 0 13.2"
            initial={false}
            animate={animate ? { opacity: 1 } : { opacity: 0.72 }}
            transition={FAST_TRANSITION}
          />
        </>
      )}
    </AnimatedIconBase>
  );
}

export function AudioLinesIcon(props: AnimatedIconProps) {
  const lineDefs = [
    { x: 4.5, y1: 9, y2: 15 },
    { x: 9.5, y1: 5.5, y2: 18.5 },
    { x: 14.5, y1: 7.5, y2: 16.5 },
    { x: 19.5, y1: 10, y2: 14 }
  ];

  return (
    <AnimatedIconBase {...props}>
      {({ animate }) => (
        <>
          {lineDefs.map((line, index) => (
            <motion.path
              key={line.x}
              d={`M${line.x} ${line.y1}V${line.y2}`}
              initial={false}
              animate={animate
                ? { scaleY: [0.82, 1.2, 0.74, 1], y: [0.8, -1.2, 0.55, 0] }
                : { scaleY: 1, y: 0 }}
              transition={animate
                ? {
                    duration: 0.88,
                    ease: "easeInOut",
                    repeat: Number.POSITIVE_INFINITY,
                    repeatType: "mirror",
                    delay: index * 0.06
                  }
                : FAST_TRANSITION}
              style={{ originX: "50%", originY: "50%" }}
            />
          ))}
        </>
      )}
    </AnimatedIconBase>
  );
}

export function FolderOpenIcon(props: AnimatedIconProps) {
  return (
    <AnimatedIconBase {...props}>
      {({ animate }) => (
        <>
          <path d="M3.8 8.2A2.2 2.2 0 0 1 6 6h4.2l1.8 2h6a2.2 2.2 0 0 1 2.2 2.2v.6" />
          <motion.path
            d="M4.2 10.3h15.6l-1.6 7.1A2.2 2.2 0 0 1 16 19H6.2A2.2 2.2 0 0 1 4 16.8l.2-6.5Z"
            initial={false}
            animate={animate ? { y: 0.75 } : { y: 0 }}
            transition={FAST_TRANSITION}
          />
        </>
      )}
    </AnimatedIconBase>
  );
}

export function FolderOutputIcon(props: AnimatedIconProps) {
  return (
    <AnimatedIconBase {...props}>
      {({ animate }) => (
        <>
          <path d="M3.8 8.2A2.2 2.2 0 0 1 6 6h4.2l1.8 2h6a2.2 2.2 0 0 1 2.2 2.2v6.6A2.2 2.2 0 0 1 18 19H6.2A2.2 2.2 0 0 1 4 16.8v-6.4" />
          <motion.g
            initial={false}
            animate={animate ? { x: 1.1 } : { x: 0 }}
            transition={FAST_TRANSITION}
          >
            <path d="M11 12h7" />
            <path d="m15.5 8 4.5 4-4.5 4" />
          </motion.g>
        </>
      )}
    </AnimatedIconBase>
  );
}

export function ArrowUpRightIcon(props: AnimatedIconProps) {
  return (
    <AnimatedIconBase {...props}>
      {({ animate }) => (
        <motion.g
          initial={false}
          animate={animate ? { x: 0.8, y: -0.8 } : { x: 0, y: 0 }}
          transition={FAST_TRANSITION}
        >
          <path d="M7 17 17 7" />
          <path d="M9 7h8v8" />
        </motion.g>
      )}
    </AnimatedIconBase>
  );
}

export function RotateCwIcon(props: AnimatedIconProps) {
  return (
    <AnimatedIconBase {...props}>
      {({ animate }) => (
        <motion.g
          initial={false}
          animate={animate ? { rotate: 36 } : { rotate: 0 }}
          transition={STANDARD_TRANSITION}
          style={{ originX: "50%", originY: "50%" }}
        >
          <path d="M20 6v5h-5" />
          <path d="M19.2 11a7.2 7.2 0 1 1-2.1-5.1L20 8.8" />
        </motion.g>
      )}
    </AnimatedIconBase>
  );
}

export function BellIcon(props: AnimatedIconProps) {
  return (
    <AnimatedIconBase {...props}>
      {({ animate }) => (
        <>
          <motion.path
            d="M8 17h8a1.8 1.8 0 0 0 1.5-2.9l-.9-1.3v-2.1a4.6 4.6 0 1 0-9.2 0v2.1l-.9 1.3A1.8 1.8 0 0 0 8 17Z"
            initial={false}
            animate={animate ? { rotate: 8 } : { rotate: 0 }}
            transition={FAST_TRANSITION}
            style={{ originX: "50%", originY: "30%" }}
          />
          <path d="M10 19a2 2 0 0 0 4 0" />
        </>
      )}
    </AnimatedIconBase>
  );
}

export function MonitorCheckIcon(props: AnimatedIconProps) {
  return (
    <AnimatedIconBase {...props}>
      {({ animate }) => (
        <>
          <rect x="3.5" y="5" width="17" height="12" rx="2.2" />
          <path d="M9 20h6" />
          <path d="M12 17v3" />
          <motion.path
            d="m8.6 11.5 2.1 2.1 4.6-4.6"
            initial={false}
            animate={animate ? { scale: 1.08 } : { scale: 1 }}
            transition={FAST_TRANSITION}
            style={{ originX: "50%", originY: "50%" }}
          />
        </>
      )}
    </AnimatedIconBase>
  );
}

export function EyeIcon(props: AnimatedIconProps) {
  return (
    <AnimatedIconBase {...props}>
      {({ animate }) => (
        <>
          <path d="M2.8 12s3.2-5 9.2-5 9.2 5 9.2 5-3.2 5-9.2 5-9.2-5-9.2-5Z" />
          <motion.circle
            cx="12"
            cy="12"
            r="2.3"
            initial={false}
            animate={animate ? { scale: 1.15 } : { scale: 1 }}
            transition={FAST_TRANSITION}
            style={{ originX: "50%", originY: "50%" }}
          />
        </>
      )}
    </AnimatedIconBase>
  );
}

export function EyeOffIcon(props: AnimatedIconProps) {
  return (
    <AnimatedIconBase {...props}>
      {({ animate }) => (
        <>
          <path d="M3 3 21 21" />
          <motion.path
            d="M10.6 7.2A9.6 9.6 0 0 1 12 7c6 0 9.2 5 9.2 5a14.8 14.8 0 0 1-3.2 3.6"
            initial={false}
            animate={animate ? { x: -0.5 } : { x: 0 }}
            transition={FAST_TRANSITION}
          />
          <motion.path
            d="M6 6.6A14.1 14.1 0 0 0 2.8 12s3.2 5 9.2 5c.5 0 1 0 1.5-.1"
            initial={false}
            animate={animate ? { x: 0.5 } : { x: 0 }}
            transition={FAST_TRANSITION}
          />
        </>
      )}
    </AnimatedIconBase>
  );
}

export function LogOutIcon(props: AnimatedIconProps) {
  return (
    <AnimatedIconBase {...props}>
      {({ animate }) => (
        <>
          <path d="M9 20H6.5A2.5 2.5 0 0 1 4 17.5v-11A2.5 2.5 0 0 1 6.5 4H9" />
          <motion.g
            initial={false}
            animate={animate ? { x: 1.2 } : { x: 0 }}
            transition={FAST_TRANSITION}
          >
            <path d="M13 8.2 18 12l-5 3.8" />
            <path d="M9 12h9" />
          </motion.g>
        </>
      )}
    </AnimatedIconBase>
  );
}

export function ChevronLeftIcon(props: AnimatedIconProps) {
  return (
    <AnimatedIconBase {...props}>
      {({ animate }) => (
        <motion.path
          d="m14.6 6.8-5.2 5.2 5.2 5.2"
          initial={false}
          animate={animate ? { x: -0.8 } : { x: 0 }}
          transition={FAST_TRANSITION}
        />
      )}
    </AnimatedIconBase>
  );
}

export function ChevronRightIcon(props: AnimatedIconProps) {
  return (
    <AnimatedIconBase {...props}>
      {({ animate }) => (
        <motion.path
          d="m9.4 6.8 5.2 5.2-5.2 5.2"
          initial={false}
          animate={animate ? { x: 0.8 } : { x: 0 }}
          transition={FAST_TRANSITION}
        />
      )}
    </AnimatedIconBase>
  );
}

export function BadgeAlertIcon(props: AnimatedIconProps) {
  return (
    <AnimatedIconBase {...props}>
      {({ animate }) => (
        <>
          <path d="M12 3.7 5.1 7.2v7.6l6.9 5 6.9-5V7.2L12 3.7Z" />
          <motion.path
            d="M12 8.3v5.1"
            initial={false}
            animate={animate ? { scaleY: 1.12 } : { scaleY: 1 }}
            transition={FAST_TRANSITION}
            style={{ originX: "50%", originY: "50%" }}
          />
          <circle cx="12" cy="16.5" r="0.8" fill="currentColor" stroke="none" />
        </>
      )}
    </AnimatedIconBase>
  );
}

export function UploadIcon(props: AnimatedIconProps) {
  return (
    <AnimatedIconBase {...props}>
      {({ animate }) => (
        <>
          <path d="M5 18.5h14" />
          <motion.g
            initial={false}
            animate={animate ? { y: -1 } : { y: 0 }}
            transition={FAST_TRANSITION}
          >
            <path d="M12 18V6.5" />
            <path d="m7.5 10.8 4.5-4.8 4.5 4.8" />
          </motion.g>
        </>
      )}
    </AnimatedIconBase>
  );
}

export function XIcon(props: AnimatedIconProps) {
  return (
    <AnimatedIconBase {...props}>
      {({ animate }) => (
        <>
          <motion.path
            d="M6 6 18 18"
            initial={false}
            animate={animate ? { rotate: 6 } : { rotate: 0 }}
            transition={FAST_TRANSITION}
            style={{ originX: "50%", originY: "50%" }}
          />
          <motion.path
            d="M18 6 6 18"
            initial={false}
            animate={animate ? { rotate: -6 } : { rotate: 0 }}
            transition={FAST_TRANSITION}
            style={{ originX: "50%", originY: "50%" }}
          />
        </>
      )}
    </AnimatedIconBase>
  );
}

export function PenIcon(props: AnimatedIconProps) {
  return (
    <AnimatedIconBase {...props}>
      {({ animate }) => (
        <motion.g
          initial={false}
          animate={animate ? { rotate: -10, x: 0.5, y: -0.5 } : { rotate: 0, x: 0, y: 0 }}
          transition={FAST_TRANSITION}
          style={{ originX: "50%", originY: "50%" }}
        >
          <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
        </motion.g>
      )}
    </AnimatedIconBase>
  );
}

export function HighlighterIcon(props: AnimatedIconProps) {
  return (
    <AnimatedIconBase {...props}>
      {({ animate }) => (
        <>
          <motion.path
            d="m9 11-6 6v3h3l6-6"
            initial={false}
            animate={animate ? { y: 0.5 } : { y: 0 }}
            transition={FAST_TRANSITION}
          />
          <motion.path
            d="m22 2-3 3-8.5 8.5 3 3 8.5-8.5Z"
            initial={false}
            animate={animate ? { rotate: 8 } : { rotate: 0 }}
            transition={FAST_TRANSITION}
            style={{ originX: "62%", originY: "30%" }}
          />
          <path d="M6 20h4" />
        </>
      )}
    </AnimatedIconBase>
  );
}

export function ArrowDiagonalIcon(props: AnimatedIconProps) {
  return (
    <AnimatedIconBase {...props}>
      {({ animate }) => (
        <motion.g
          initial={false}
          animate={animate ? { x: 0.7, y: -0.7 } : { x: 0, y: 0 }}
          transition={FAST_TRANSITION}
        >
          <path d="M5 19 19 5" />
          <path d="M9 5h10v10" />
        </motion.g>
      )}
    </AnimatedIconBase>
  );
}
