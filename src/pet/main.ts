import idleSheetUrl from "../../assets/pet/snail_idle_sprite.svg";
import moveSheetUrl from "../../assets/pet/snail_move_sprite.svg";
import workSheetUrl from "../../assets/pet/snail_work_sprite.svg";
import "./styles.css";

type PetVisualState = "idle" | "move" | "work";

type SheetConfig = {
  imageUrl: string;
  frameCount: number;
  image: HTMLImageElement;
};

const SHEETS: Record<PetVisualState, Omit<SheetConfig, "image">> = {
  idle: {
    imageUrl: idleSheetUrl,
    frameCount: 4
  },
  move: {
    imageUrl: moveSheetUrl,
    frameCount: 4
  },
  work: {
    imageUrl: workSheetUrl,
    frameCount: 8
  }
};

const snail = document.getElementById("snail");

if (!(snail instanceof HTMLCanvasElement)) {
  throw new Error("Snail canvas element was not found.");
}

const canvas = snail;
const context = canvas.getContext("2d");

if (!context) {
  throw new Error("Snail canvas context could not be created.");
}

const canvasContext = context;

const sheets = Object.fromEntries(
  Object.entries(SHEETS).map(([state, config]) => {
    const image = new Image();
    image.src = config.imageUrl;
    return [state, { ...config, image }];
  })
) as Record<PetVisualState, SheetConfig>;

let currentState: PetVisualState = "idle";
let currentFrame = 0;
let flipX = false;
let rotationDeg = 0;
let lastFrameAt = performance.now();
let configuredWindowSize = 96;
let configuredSpriteSizePx = 96;
let currentHostPaddingPx = 0;
let currentFrameDurationMs = 100;

function applyCanvasSize(): void {
  canvas.width = configuredWindowSize;
  canvas.height = configuredWindowSize;
  canvas.style.width = `${configuredWindowSize}px`;
  canvas.style.height = `${configuredWindowSize}px`;
  canvasContext.imageSmoothingEnabled = false;
}

function drawFrame(): void {
  const sheet = sheets[currentState];
  const sourceX = currentFrame * 32;
  const spriteOrigin = -configuredWindowSize / 2 + currentHostPaddingPx;

  canvasContext.setTransform(1, 0, 0, 1, 0, 0);
  canvasContext.clearRect(0, 0, canvas.width, canvas.height);
  canvasContext.save();
  canvasContext.translate(canvas.width / 2, canvas.height / 2);
  canvasContext.rotate((rotationDeg * Math.PI) / 180);

  if (flipX) {
    canvasContext.scale(-1, 1);
  }

  canvasContext.drawImage(
    sheet.image,
    sourceX,
    0,
    32,
    32,
    spriteOrigin,
    spriteOrigin,
    configuredSpriteSizePx,
    configuredSpriteSizePx
  );

  canvasContext.restore();
}

function renderCurrentState(): void {
  const image = sheets[currentState].image;

  if (!image.complete) {
    return;
  }

  drawFrame();
}

function animate(now: number): void {
  const sheet = sheets[currentState];
  if (now - lastFrameAt >= currentFrameDurationMs) {
    currentFrame = (currentFrame + 1) % sheet.frameCount;
    lastFrameAt = now;
    renderCurrentState();
  }

  requestAnimationFrame(animate);
}

window.addEventListener("resize", () => {
  applyCanvasSize();
  renderCurrentState();
});

window.snailPetAPI.onVisualState((payload) => {
  const stateChanged = payload.state !== currentState;
  currentState = payload.state;
  flipX = payload.flipX;
  rotationDeg = payload.rotationDeg;
  configuredWindowSize = payload.windowSize;
  configuredSpriteSizePx = payload.spriteSizePx;
  currentHostPaddingPx = payload.hostPaddingPx;
  currentFrameDurationMs = payload.frameDurationMs;
  applyCanvasSize();

  if (stateChanged) {
    currentFrame = 0;
    lastFrameAt = performance.now();
  }

  renderCurrentState();
});

for (const sheet of Object.values(sheets)) {
  sheet.image.addEventListener("load", () => {
    if (sheet === sheets[currentState]) {
      renderCurrentState();
    }
  });
}

applyCanvasSize();
renderCurrentState();
requestAnimationFrame(animate);
