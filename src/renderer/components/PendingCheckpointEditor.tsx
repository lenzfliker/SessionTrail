import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { PendingCheckpoint } from "../../shared/contracts";
import { CheckIcon, IconLabel, RotateCwIcon, TrashIcon, PenIcon, HighlighterIcon, ArrowDiagonalIcon } from "./animated-icons";

type AnnotationTool = "pen" | "highlighter" | "arrow";
type AnnotationColor = "#dc2626" | "#5522bb" | "#16a34a" | "#f59e0b";
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

const COLOR_OPTIONS: AnnotationColor[] = ["#dc2626", "#5522bb", "#16a34a", "#f59e0b"];

function buildPath(points: NormalizedPoint[], vw: number, vh: number): string {
  if (points.length === 0) {
    return "";
  }

  return points
    .map((point, index) => {
      const x = Math.round(point.x * vw);
      const y = Math.round(point.y * vh);
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
}

function getArrowHeadPoints(
  startPx: { x: number; y: number },
  endPx: { x: number; y: number },
  sizePx: number
) {
  const dx = endPx.x - startPx.x;
  const dy = endPx.y - startPx.y;
  const angle = Math.atan2(dy, dx);
  const left = {
    x: endPx.x - Math.cos(angle - Math.PI / 6) * sizePx,
    y: endPx.y - Math.sin(angle - Math.PI / 6) * sizePx
  };
  const right = {
    x: endPx.x - Math.cos(angle + Math.PI / 6) * sizePx,
    y: endPx.y - Math.sin(angle + Math.PI / 6) * sizePx
  };

  return [left, endPx, right];
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

function renderSvgAnnotation(annotation: Annotation, vw: number, vh: number) {
  if (annotation.tool === "arrow") {
    const startPx = {
      x: Math.round(annotation.start.x * vw),
      y: Math.round(annotation.start.y * vh)
    };
    const endPx = {
      x: Math.round(annotation.end.x * vw),
      y: Math.round(annotation.end.y * vh)
    };
    const sizePx = Math.round(Math.min(vw, vh) * 0.022);
    const arrowHead = getArrowHeadPoints(startPx, endPx, sizePx);

    return (
      <g key={annotation.id}>
        <line
          x1={startPx.x}
          y1={startPx.y}
          x2={endPx.x}
          y2={endPx.y}
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
      d={buildPath(annotation.points, vw, vh)}
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
            {(
              [
                { id: "pen",         label: "Pen",         Icon: PenIcon },
                { id: "highlighter", label: "Highlighter",  Icon: HighlighterIcon },
                { id: "arrow",       label: "Arrow",        Icon: ArrowDiagonalIcon },
              ] as const
            ).map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                className={tool === id ? "button button--ghost checkpoint-tool checkpoint-tool--active" : "button button--ghost checkpoint-tool"}
                disabled={busy}
                onClick={() => setTool(id)}
                aria-pressed={tool === id}
              >
                <IconLabel icon={Icon} label={label} active={tool === id} />
              </button>
            ))}
          </div>
          <div className="checkpoint-annotation__toolbar-divider" aria-hidden="true" />
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
              className="button button--ghost checkpoint-tool"
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
              className="button button--ghost checkpoint-tool"
              disabled={busy || (annotations.length === 0 && !draftAnnotation)}
              onClick={() => {
                setDraftAnnotation(null);
                setAnnotations([]);
              }}
            >
              <IconLabel icon={TrashIcon} label="Clear" />
            </button>
            <button
              type="button"
              className="button button--ghost checkpoint-tool"
              disabled={busy}
              onClick={onRetake}
            >
              <IconLabel icon={RotateCwIcon} label="Retake" />
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
              viewBox={`0 0 ${imageSize.width} ${imageSize.height}`}
              preserveAspectRatio="none"
            >
              {renderedAnnotations.map((annotation) => renderSvgAnnotation(annotation, imageSize.width, imageSize.height))}
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
