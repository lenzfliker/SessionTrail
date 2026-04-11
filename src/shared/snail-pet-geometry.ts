import type { SnailPetScale } from "./contracts";

export type PetEdge = "top" | "right" | "bottom" | "left";
export type TravelDirection = -1 | 1;

export type RectLike = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type Point = {
  x: number;
  y: number;
};

export type TrackPosition = {
  offset: number;
  edge: PetEdge;
  contactX: number;
  contactY: number;
  progressOnEdge: number;
  edgeLength: number;
};

const EPSILON = 0.0001;
const BASE_CONTACT_POINT: Point = {
  x: 18,
  y: 27
};

const ANCHOR_NUDGES: Record<PetEdge, Record<"-1" | "1", Point>> = {
  top: {
    "-1": { x: 0, y: 0 },
    "1": { x: 0, y: 0 }
  },
  right: {
    "-1": { x: 0, y: 0 },
    "1": { x: 0, y: 0 }
  },
  bottom: {
    "-1": { x: 0, y: 0 },
    "1": { x: 0, y: 0 }
  },
  left: {
    "-1": { x: 0, y: 0 },
    "1": { x: 0, y: 0 }
  }
};

export const SPRITE_FRAME_SIZE = 32;
export const HOST_PADDING_BASE_PX = 12;

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function isOnBoundary(offset: number, bounds: RectLike): boolean {
  const topLength = bounds.width;
  const rightLength = bounds.height;
  const bottomLength = bounds.width;
  const boundaries = [
    0,
    topLength,
    topLength + rightLength,
    topLength + rightLength + bottomLength
  ];

  return boundaries.some((boundary) => Math.abs(offset - boundary) <= EPSILON);
}

export function getSpriteSizePx(scale: SnailPetScale): number {
  return SPRITE_FRAME_SIZE * scale;
}

export function getHostPaddingPx(scale: SnailPetScale): number {
  return Math.round((HOST_PADDING_BASE_PX * scale) / 3);
}

export function getHostWindowSize(scale: SnailPetScale): number {
  const spriteSizePx = getSpriteSizePx(scale);
  const hostPaddingPx = getHostPaddingPx(scale);
  return spriteSizePx + hostPaddingPx * 2;
}

export function getPerimeterLength(bounds: RectLike): number {
  return Math.max(0, bounds.width * 2 + bounds.height * 2);
}

export function normalizeTrackOffset(offset: number, perimeterLength: number): number {
  if (!Number.isFinite(offset) || perimeterLength <= 0) {
    return 0;
  }

  return ((offset % perimeterLength) + perimeterLength) % perimeterLength;
}

export function resolveTrackPosition(offset: number, bounds: RectLike): TrackPosition {
  const perimeterLength = getPerimeterLength(bounds);
  const normalizedOffset = normalizeTrackOffset(offset, perimeterLength);
  const topLength = bounds.width;
  const rightLength = bounds.height;
  const bottomLength = bounds.width;

  if (normalizedOffset < topLength) {
    return {
      offset: normalizedOffset,
      edge: "top",
      contactX: bounds.x + normalizedOffset,
      contactY: bounds.y,
      progressOnEdge: normalizedOffset,
      edgeLength: topLength
    };
  }

  if (normalizedOffset < topLength + rightLength) {
    const progressOnEdge = normalizedOffset - topLength;
    return {
      offset: normalizedOffset,
      edge: "right",
      contactX: bounds.x + bounds.width,
      contactY: bounds.y + progressOnEdge,
      progressOnEdge,
      edgeLength: rightLength
    };
  }

  if (normalizedOffset < topLength + rightLength + bottomLength) {
    const progressOnEdge = normalizedOffset - topLength - rightLength;
    return {
      offset: normalizedOffset,
      edge: "bottom",
      contactX: bounds.x + bounds.width - progressOnEdge,
      contactY: bounds.y + bounds.height,
      progressOnEdge,
      edgeLength: bottomLength
    };
  }

  const progressOnEdge = normalizedOffset - topLength - rightLength - bottomLength;
  return {
    offset: normalizedOffset,
    edge: "left",
    contactX: bounds.x,
    contactY: bounds.y + bounds.height - progressOnEdge,
    progressOnEdge,
    edgeLength: bounds.height
  };
}

export function resolveTrackPositionForDirection(
  offset: number,
  bounds: RectLike,
  direction: TravelDirection
): TrackPosition {
  const position = resolveTrackPosition(offset, bounds);
  if (direction > 0 || !isOnBoundary(position.offset, bounds)) {
    return position;
  }

  const topLength = bounds.width;
  const rightLength = bounds.height;
  const bottomLength = bounds.width;

  if (Math.abs(position.offset) <= EPSILON) {
    return {
      ...position,
      edge: "left",
      progressOnEdge: bounds.height,
      edgeLength: bounds.height
    };
  }

  if (Math.abs(position.offset - topLength) <= EPSILON) {
    return {
      ...position,
      edge: "top",
      progressOnEdge: topLength,
      edgeLength: topLength
    };
  }

  if (Math.abs(position.offset - (topLength + rightLength)) <= EPSILON) {
    return {
      ...position,
      edge: "right",
      progressOnEdge: rightLength,
      edgeLength: rightLength
    };
  }

  if (Math.abs(position.offset - (topLength + rightLength + bottomLength)) <= EPSILON) {
    return {
      ...position,
      edge: "bottom",
      progressOnEdge: bottomLength,
      edgeLength: bottomLength
    };
  }

  return position;
}

export function getTrackOffsetForEdgeProgress(
  edge: PetEdge,
  progressOnEdge: number,
  bounds: RectLike
): number {
  const clampedProgress = clampNumber(
    progressOnEdge,
    0,
    edge === "top" || edge === "bottom" ? bounds.width : bounds.height
  );

  switch (edge) {
    case "top":
      return clampedProgress;
    case "right":
      return bounds.width + clampedProgress;
    case "bottom":
      return bounds.width + bounds.height + clampedProgress;
    case "left":
    default:
      return bounds.width + bounds.height + bounds.width + clampedProgress;
  }
}

export function getDefaultTrackOffset(bounds: RectLike, insetPx = 20): number {
  return normalizeTrackOffset(
    getTrackOffsetForEdgeProgress("bottom", Math.min(bounds.width, Math.max(0, insetPx)), bounds),
    getPerimeterLength(bounds)
  );
}

export function getTrackOffsetFromLegacyPosition(
  edge: PetEdge,
  x: number,
  y: number,
  bounds: RectLike
): number {
  switch (edge) {
    case "top":
      return getTrackOffsetForEdgeProgress("top", clampNumber(x - bounds.x, 0, bounds.width), bounds);
    case "right":
      return getTrackOffsetForEdgeProgress("right", clampNumber(y - bounds.y, 0, bounds.height), bounds);
    case "bottom":
      return getTrackOffsetForEdgeProgress(
        "bottom",
        clampNumber(bounds.x + bounds.width - x, 0, bounds.width),
        bounds
      );
    case "left":
    default:
      return getTrackOffsetForEdgeProgress(
        "left",
        clampNumber(bounds.y + bounds.height - y, 0, bounds.height),
        bounds
      );
  }
}

export function getVisualTransform(edge: PetEdge, direction: TravelDirection): {
  rotationDeg: number;
  flipX: boolean;
} {
  const localDirection =
    edge === "bottom" || edge === "left"
      ? ((direction * -1) as TravelDirection)
      : direction;

  if (edge === "bottom") {
    return {
      rotationDeg: 0,
      flipX: localDirection < 0
    };
  }

  if (edge === "top") {
    return {
      rotationDeg: 180,
      flipX: localDirection > 0
    };
  }

  if (edge === "left") {
    return {
      rotationDeg: 90,
      flipX: localDirection < 0
    };
  }

  return {
    rotationDeg: -90,
    flipX: localDirection > 0
  };
}

export function getVisualAnchor(
  edge: PetEdge,
  direction: TravelDirection,
  renderScale: SnailPetScale,
  hostPaddingPx: number
): Point {
  const spriteSizePx = getSpriteSizePx(renderScale);
  const baseX = BASE_CONTACT_POINT.x * renderScale;
  const baseY = BASE_CONTACT_POINT.y * renderScale;
  const { rotationDeg, flipX } = getVisualTransform(edge, direction);
  const nudges = ANCHOR_NUDGES[edge][String(direction) as "-1" | "1"];

  let transformedX = baseX;
  let transformedY = baseY;

  if (flipX) {
    transformedX = spriteSizePx - transformedX;
  }

  const center = spriteSizePx / 2;
  const dx = transformedX - center;
  const dy = transformedY - center;

  let rotatedDx = dx;
  let rotatedDy = dy;

  if (rotationDeg === 90) {
    rotatedDx = -dy;
    rotatedDy = dx;
  } else if (rotationDeg === -90) {
    rotatedDx = dy;
    rotatedDy = -dx;
  } else if (Math.abs(rotationDeg) === 180) {
    rotatedDx = -dx;
    rotatedDy = -dy;
  }

  return {
    x: hostPaddingPx + center + rotatedDx + nudges.x * renderScale,
    y: hostPaddingPx + center + rotatedDy + nudges.y * renderScale
  };
}

export function getWindowOriginForContactPoint(contactPoint: Point, anchor: Point): Point {
  return {
    x: contactPoint.x - anchor.x,
    y: contactPoint.y - anchor.y
  };
}
