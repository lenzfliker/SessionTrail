import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { PendingCheckpoint } from "../../shared/contracts";
import { CheckIcon, IconLabel, RotateCwIcon } from "./animated-icons";

type AnnotationTool = "pen" | "highlighter" | "arrow";
type AnnotationColor = "#dc2626" | "#2563eb" | "#16a34a" | "#f59e0b";
type NormalizedPoint = { x: number; y: number };

type StrokeAnnotation = {
  id: string;
  tool: "pen" | "highlighter";
  color: AnnotationColor;
  points: NormalizedPoint[];
};

type ArrowAnnotation = {
  id: string;
  tool: "arrow";
  color: AnnotationColor;
  start: NormalizedPoint;
  end: NormalizedPoint;
};

type Annotation = StrokeAnnotation | ArrowAnnotation;

type PendingCheckpointEditorProps = {
  pendingCheckpoint: PendingCheckpoint;
  noteText: string;
  busy: boolean;
  onNoteChange: (value: string) => void;
  onRetake: () => void;
  onSave: (editedScreenshotBuffer: Promise<ArrayBuffer | null>) => void;
};

const VIEWBOX_SIZE = 1000;
const COLOR_OPTIONS: AnnotationColor[] = ["#dc2626", "#2563eb", "#16a34a", "#f59e0b"];

function buildPath(points: NormalizedPoint[]): string {
  if (points.length === 0) {
    return "";
  }

  return points
    .map((point, index) => {
      const x = Math.round(point.x * VIEWBOX_SIZE);
      const y = Math.round(point.y * VIEWBOX_SIZE);
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
}

function getArrowHeadPoints(start: NormalizedPoint, end: NormalizedPoint, size: number) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const angle = Math.atan2(dy, dx);
  const left = {
    x: end.x - Math.cos(angle - Math.PI / 6) * size,
    y: end.y - Math.sin(angle - Math.PI / 6) * size
  };
  const right = {
    x: end.x - Math.cos(angle + Math.PI / 6) * size,
    y: end.y - Math.sin(angle + Math.PI / 6) * size
  };

  return [left, end, right];
}

function strokeWidthFor(tool: AnnotationTool): number {
  if (tool === "highlighter") {
    return 18;
  }
  if (tool === "arrow") {
    return 10;
  }
  return 7;
}

function renderSvgAnnotation(annotation: Annotation) {
  if (annotation.tool === "arrow") {
    const arrowHead = getArrowHeadPoints(annotation.start, annotation.end, 0.022).map((point) => ({
      x: Math.round(point.x * VIEWBOX_SIZE),
      y: Math.round(point.y * VIEWBOX_SIZE)
    }));

    return (
      <g key={annotation.id}>
        <line
          x1={Math.round(annotation.start.x * VIEWBOX_SIZE)}
          y1={Math.round(annotation.start.y * VIEWBOX_SIZE)}
          x2={Math.round(annotation.end.x * VIEWBOX_SIZE)}
          y2={Math.round(annotation.end.y * VIEWBOX_SIZE)}
          stroke={annotation.color}
          strokeWidth={strokeWidthFor(annotation.tool)}
          strokeLinecap="round"
        />
        <polyline
          points={arrowHead.map((point) => `${point.x},${point.y}`).join(" ")}
          fill="none"
          stroke={annotation.color}
          strokeWidth={strokeWidthFor(annotation.tool)}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    );
  }

  return (
    <path
      key={annotation.id}
      d={buildPath(annotation.points)}
      fill="none"
      stroke={annotation.color}
      strokeWidth={strokeWidthFor(annotation.tool)}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeOpacity={annotation.tool === "highlighter" ? 0.35 : 1}
    />
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function createAnnotationId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

function drawCanvasAnnotation(
  context: CanvasRenderingContext2D,
  annotation: Annotation,
  width: number,
  height: number
) {
  context.save();
  context.strokeStyle = annotation.color;
  context.fillStyle = annotation.color;
  context.lineCap = "round";
  context.lineJoin = "round";

  const scaleBase = Math.max(1, Math.min(width, height));
  if (annotation.tool === "highlighter") {
    context.globalAlpha = 0.35;
    context.lineWidth = Math.max(10, scaleBase * 0.02);
  } else if (annotation.tool === "arrow") {
    context.lineWidth = Math.max(6, scaleBase * 0.008);
  } else {
    context.lineWidth = Math.max(4, scaleBase * 0.006);
  }

  if (annotation.tool === "arrow") {
    const startX = annotation.start.x * width;
    const startY = annotation.start.y * height;
    const endX = annotation.end.x * width;
    const endY = annotation.end.y * height;
    context.beginPath();
    context.moveTo(startX, startY);
    context.lineTo(endX, endY);
    context.stroke();

    const arrowSize = Math.max(16, scaleBase * 0.02);
    const dx = endX - startX;
    const dy = endY - startY;
    const angle = Math.atan2(dy, dx);
    context.beginPath();
    context.moveTo(endX, endY);
    context.lineTo(
      endX - Math.cos(angle - Math.PI / 6) * arrowSize,
      endY - Math.sin(angle - Math.PI / 6) * arrowSize
    );
    context.moveTo(endX, endY);
    context.lineTo(
      endX - Math.cos(angle + Math.PI / 6) * arrowSize,
      endY - Math.sin(angle + Math.PI / 6) * arrowSize
    );
    context.stroke();
    context.restore();
    return;
  }

  const points = annotation.points;
  if (points.length === 0) {
    context.restore();
    return;
  }

  context.beginPath();
  context.moveTo(points[0].x * width, points[0].y * height);
  for (let index = 1; index < points.length; index += 1) {
    context.lineTo(points[index].x * width, points[index].y * height);
  }
  if (points.length === 1) {
    context.lineTo(points[0].x * width + 0.5, points[0].y * height + 0.5);
  }
  context.stroke();
  context.restore();
}

export function PendingCheckpointEditor({
  pendingCheckpoint,
  noteText,
  busy,
  onNoteChange,
  onRetake,
  onSave
}: PendingCheckpointEditorProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const draftAnnotationRef = useRef<Annotation | null>(null);
  const [tool, setTool] = useState<AnnotationTool>("pen");
  const [color, setColor] = useState<AnnotationColor>("#dc2626");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [draftAnnotation, setDraftAnnotation] = useState<Annotation | null>(null);
  const [imageSize, setImageSize] = useState({ width: 16, height: 9 });

  useEffect(() => {
    setAnnotations([]);
    setDraftAnnotation(null);
  }, [pendingCheckpoint.checkpoint.id, pendingCheckpoint.screenshotDataUrl]);

  const renderedAnnotations = useMemo(
    () => [...annotations, ...(draftAnnotation ? [draftAnnotation] : [])],
    [annotations, draftAnnotation]
  );

  useEffect(() => {
    draftAnnotationRef.current = draftAnnotation;
  }, [draftAnnotation]);

  const getNormalizedPoint = (clientX: number, clientY: number): NormalizedPoint | null => {
    const stage = stageRef.current;
    if (!stage) {
      return null;
    }

    const rect = stage.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }

    return {
      x: clamp((clientX - rect.left) / rect.width, 0, 1),
      y: clamp((clientY - rect.top) / rect.height, 0, 1)
    };
  };

  const commitDraft = () => {
    const nextAnnotation = draftAnnotationRef.current;
    if (!nextAnnotation) {
      return;
    }

    if (nextAnnotation.tool === "arrow") {
      const distance = Math.hypot(
        nextAnnotation.end.x - nextAnnotation.start.x,
        nextAnnotation.end.y - nextAnnotation.start.y
      );
      if (distance > 0.005) {
        setAnnotations((previous) => [...previous, nextAnnotation]);
      }
    } else if (nextAnnotation.points.length > 0) {
      setAnnotations((previous) => [...previous, nextAnnotation]);
    }

    setDraftAnnotation(null);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (busy || event.button !== 0) {
      return;
    }

    const point = getNormalizedPoint(event.clientX, event.clientY);
    if (!point) {
      return;
    }

    activePointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraftAnnotation(
      tool === "arrow"
        ? {
            id: createAnnotationId(),
            tool: "arrow",
            color,
            start: point,
            end: point
          }
        : {
            id: createAnnotationId(),
            tool,
            color,
            points: [point]
          }
    );
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (busy || activePointerIdRef.current !== event.pointerId) {
      return;
    }

    const point = getNormalizedPoint(event.clientX, event.clientY);
    if (!point) {
      return;
    }

    setDraftAnnotation((current) => {
      if (!current) {
        return current;
      }

      if (current.tool === "arrow") {
        return {
          ...current,
          end: point
        };
      }

      return {
        ...current,
        points: [...current.points, point]
      };
    });
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== event.pointerId) {
      return;
    }

    activePointerIdRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    commitDraft();
  };

  const exportEditedScreenshot = async (): Promise<ArrayBuffer | null> => {
    if (annotations.length === 0) {
      return null;
    }

    const image = new Image();
    image.src = pendingCheckpoint.screenshotDataUrl;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => {
        setImageSize({ width: image.naturalWidth, height: image.naturalHeight });
        resolve();
      };
      image.onerror = () => reject(new Error("Unable to load checkpoint screenshot for annotation export."));
    });

    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Unable to prepare the annotation canvas.");
    }

    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const annotation of annotations) {
      drawCanvasAnnotation(context, annotation, canvas.width, canvas.height);
    }

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) {
      throw new Error("Unable to render the edited checkpoint screenshot.");
    }

    return blob.arrayBuffer();
  };

  return (
    <>
      <div className="checkpoint-annotation">
        <div className="checkpoint-annotation__toolbar">
          <div className="checkpoint-annotation__tools">
            {(["pen", "highlighter", "arrow"] as const).map((nextTool) => (
              <button
                key={nextTool}
                type="button"
                className={tool === nextTool ? "button checkpoint-tool checkpoint-tool--active" : "button button--ghost checkpoint-tool"}
                disabled={busy}
                onClick={() => setTool(nextTool)}
              >
                {nextTool}
              </button>
            ))}
          </div>
          <div className="checkpoint-annotation__colors">
            {COLOR_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                className={color === option ? "checkpoint-color checkpoint-color--active" : "checkpoint-color"}
                style={{ "--checkpoint-color": option } as CSSProperties}
                disabled={busy}
                onClick={() => setColor(option)}
                aria-label={`Use ${option} annotation color`}
              />
            ))}
          </div>
          <div className="checkpoint-annotation__actions">
            <button
              type="button"
              className="button button--ghost"
              disabled={busy || annotations.length === 0}
              onClick={() => {
                setDraftAnnotation(null);
                setAnnotations((current) => current.slice(0, -1));
              }}
            >
              Undo
            </button>
            <button
              type="button"
              className="button button--ghost"
              disabled={busy || (annotations.length === 0 && !draftAnnotation)}
              onClick={() => {
                setDraftAnnotation(null);
                setAnnotations([]);
              }}
            >
              Clear
            </button>
            <button
              type="button"
              className="button button--ghost"
              disabled={busy}
              onClick={onRetake}
            >
              <IconLabel icon={RotateCwIcon} label="Retake screenshot" />
            </button>
          </div>
        </div>

        <div className="checkpoint-annotation__stage-shell">
          <div
            ref={stageRef}
            className={busy ? "checkpoint-annotation__stage checkpoint-annotation__stage--busy" : "checkpoint-annotation__stage"}
            style={{ aspectRatio: `${imageSize.width} / ${imageSize.height}` }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <img
              className="checkpoint-annotation__image"
              src={pendingCheckpoint.screenshotDataUrl}
              alt="Checkpoint screenshot"
              onLoad={(event) => {
                const image = event.currentTarget;
                if (image.naturalWidth > 0 && image.naturalHeight > 0) {
                  setImageSize({ width: image.naturalWidth, height: image.naturalHeight });
                }
              }}
            />
            <svg
              className="checkpoint-annotation__overlay"
              viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
              preserveAspectRatio="none"
            >
              {renderedAnnotations.map((annotation) => renderSvgAnnotation(annotation))}
            </svg>
          </div>
        </div>
      </div>

      <p className="checkpoint-overlay__hint">
        Required to continue. Add a short note, and use pen, highlighter, or arrow markup if needed.
      </p>
      <label className="field">
        <span>Note</span>
        <textarea
          rows={4}
          value={noteText}
          placeholder="What did you just do or decide?"
          onChange={(event) => onNoteChange(event.target.value)}
          autoFocus
        />
      </label>
      <div className="button-row">
        <button
          type="button"
          className="button"
          disabled={busy || noteText.trim().length === 0}
          onClick={() => onSave(exportEditedScreenshot())}
        >
          <IconLabel icon={CheckIcon} label="Save note" />
        </button>
      </div>
    </>
  );
}
