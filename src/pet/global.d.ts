type SnailPetVisualState = {
  state: "idle" | "move" | "work";
  rotationDeg: number;
  flipX: boolean;
  renderScale: 2 | 3 | 4;
  windowSize: number;
  spriteSizePx: number;
  hostPaddingPx: number;
  frameDurationMs: number;
};

type SnailPetApi = {
  onVisualState: (listener: (payload: SnailPetVisualState) => void) => () => void;
};

declare global {
  interface Window {
    snailPetAPI: SnailPetApi;
  }
}

export {};
