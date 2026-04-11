# SessionTrail Snail Pet — Feature Implementation Guide

This guide is for adding a **small always-on-top snail desktop pet** to your existing Electron tray app.

It assumes:
- your Electron app and tray setup already exist
- the sprite files are already in your project directory
- you want **Option A**: a **small pet-sized overlay window only**
- the snail behavior is **ambient/random**, not tied to keystrokes or app activity
- the snail should move **only along the edges of the current display/work area**
- the sprite should be flipped in code when moving in the opposite direction

---

## Goals

Implement a snail pet that:
- uses a **single tiny transparent BrowserWindow**
- animates from three sprite sheets:
  - `snail_idle_sprite.svg`
  - `snail_move_sprite.svg`
  - `snail_work_sprite.svg`
- walks around the four walls of the current display/work area:
  - top edge
  - right edge
  - bottom edge
  - left edge
- can reverse direction on an edge
- randomly switches between:
  - idle
  - move
  - work
- is not controlled by user typing or app events
- is lightweight and simple enough for Codex to implement safely

---

## Recommended Architecture

Use **one dedicated pet window** plus a small pet renderer.

### Main process responsibilities
- create and manage the pet `BrowserWindow`
- persist pet position and config
- own the movement/state machine tick
- clamp the pet to the display work area
- send state updates to the renderer
- optionally expose tray actions:
  - show/hide snail
  - pause snail
  - reset position

### Renderer responsibilities
- render the sprite sheet animation
- switch between idle / move / work sheets
- flip sprite horizontally when needed
- stay visually simple
- no heavy framework required

### Why this is the right fit
This avoids:
- fullscreen click-through overlays
- dual-window hitbox complexity
- unnecessary Electron renderer overhead
- input weirdness caused by owning too much of the desktop

---

## Sprite Facts From Your Exported Files

Use these values directly.

### Idle
- file: `snail_idle_sprite.svg`
- frame size: `32x32`
- frame count: `4`
- duration per frame: `100ms`
- total loop duration: `400ms`

### Move
- file: `snail_move_sprite.svg`
- frame size: `32x32`
- frame count: `4`
- duration per frame: `100ms`
- total loop duration: `400ms`

### Work
- file: `snail_work_sprite.svg`
- frame size: `32x32`
- frame count: `8`
- duration per frame: `100ms`
- total loop duration: `800ms`

### Important note
The `work` export appears to contain only the working frames even though its metadata still includes frame tags for Idle/Move/Working. Do **not** rely on tags here. Treat each exported sheet as its own standalone animation and derive frame count from the actual `frames` entries in its JSON.

---

## Suggested Folder Layout

Example:

```text
src/
  pet/
    pet-controller.js
    pet-preload.js
    pet.html
    pet.css
    pet-renderer.js
    pet-types.js
    sprite-meta.js
assets/
  pet/
    snail_idle_sprite.svg
    snail_idle_sprite.json
    snail_move_sprite.svg
    snail_move_sprite.json
    snail_work_sprite.svg
    snail_work_sprite.json
```

If your assets already live elsewhere, keep them there and update paths in the examples.

---

## Window Design

Use one tiny transparent always-on-top window.

### Recommended window size
The sprite frames are `32x32`, but you will probably want them rendered larger.

Use:
- logical pet frame: `32x32`
- render scale: `3x`
- window size: `96x96`

Recommended starting window config:

```js
const petWindow = new BrowserWindow({
  width: 96,
  height: 96,
  x: 100,
  y: 100,
  frame: false,
  transparent: true,
  resizable: false,
  hasShadow: false,
  alwaysOnTop: true,
  skipTaskbar: true,
  fullscreenable: false,
  focusable: false,
  webPreferences: {
    preload: path.join(__dirname, "pet-preload.js"),
    contextIsolation: true,
    nodeIntegration: false,
    backgroundThrottling: false,
  },
});
```

### Notes
- `focusable: false` is fine because this pet does not need active interaction.
- `backgroundThrottling: false` helps animation stay consistent while unfocused.
- keep the window small and never fullscreen.

---

## Movement Model

The snail should move only along the **current display work area perimeter**.

That means movement is constrained to a rectangle:
- left = workArea.x
- top = workArea.y
- right = workArea.x + workArea.width - petWidth
- bottom = workArea.y + workArea.height - petHeight

### Edge enum
Use:
- `top`
- `right`
- `bottom`
- `left`

### Direction model
There are two layers of direction:

1. **Edge direction**: which wall the snail is on
2. **Travel direction on that wall**:
   - top/bottom: horizontal motion
   - left/right: vertical motion

A simple representation:

```js
{
  edge: 'bottom',
  direction: 1, // +1 or -1
}
```

Where:
- on `top` or `bottom`, direction changes `x`
- on `left` or `right`, direction changes `y`

### Sprite flip rule
Only flip horizontally when moving left vs right.

Recommended:
- moving right => `flipX = false`
- moving left => `flipX = true`
- on vertical edges, keep the last horizontal facing

This feels natural for a snail and avoids needing vertical sprite rotations.

---

## Behavior Design

The pet should feel ambient and alive.

### State set
Use exactly:
- `idle`
- `move`
- `work`

### Behavior rules
Recommended rules:

#### idle
- snail stays in place
- plays idle animation loop
- lasts random `2s–7s`

#### move
- snail crawls along current edge
- plays move animation loop
- lasts random `3s–10s`
- if it reaches a corner during move:
  - 65% chance continue to next wall
  - 35% chance reverse on current wall

#### work
- snail stops moving
- plays working animation loop
- lasts random `2s–6s`
- should happen less often than idle/move

### Suggested weighted random transitions
At the end of each behavior interval:

- 50% idle
- 35% move
- 15% work

Add a simple rule:
- if currently on `work`, next state cannot be `work` twice in a row
- if currently on `idle` twice in a row, bias toward `move`

That keeps it from feeling stuck.

---

## Timing Model

Use **two loops**, not one giant complicated one.

### 1. Simulation tick
Main process tick for movement and decisions.

Recommended interval:
- `50ms` for simulation

This is enough for gentle movement and keeps CPU low.

### 2. Animation loop
Renderer animation based on sheet frame duration.

Since all exported frame durations are `100ms`, keep the animation loop fully in the renderer.

---

## Movement Speed

Recommended starting speed:

```js
const MOVE_SPEED_PX_PER_SEC = 22;
```

At 50ms tick:

```js
const deltaPx = MOVE_SPEED_PX_PER_SEC * (tickMs / 1000);
```

So at `50ms`:
- `22 * 0.05 = 1.1px` per tick

That gives a slow smooth crawl.

If you want stronger pixel-art stepping, quantize positions when sending to the window:

```js
Math.round(x)
Math.round(y)
```

---

## Corner Logic

When the snail reaches a corner, do not let it drift off the wall.

### Clamp first
Always clamp to edge before deciding next action.

### Then choose one of:

#### Continue clockwise/counterclockwise
Example for clockwise order:
- top -> right
- right -> bottom
- bottom -> left
- left -> top

#### Reverse direction on same edge
Examples:
- top moving right -> top moving left
- left moving down -> left moving up

### Best rule
At each corner:

```js
if (Math.random() < 0.65) {
  advanceToAdjacentEdge();
} else {
  reverseDirectionOnCurrentEdge();
}
```

This gives more exploration and less bouncing.

---

## Multi-display Policy

Keep it simple.

### Recommended policy
The snail lives on the display that currently contains its window.

Whenever movement/state updates:
1. find nearest display for current pet position
2. use that display's `workArea`
3. keep the snail constrained to that perimeter

### Do not do yet
- do not let it jump between displays automatically
- do not pathfind across monitors
- do not cross bezels

That can come later if desired.

---

## Persistence

Persist these values in a JSON file under `app.getPath('userData')`:

```json
{
  "visible": true,
  "edge": "bottom",
  "direction": 1,
  "x": 1200,
  "y": 980,
  "flipX": false,
  "state": "idle",
  "paused": false
}
```

### Restore logic
On startup:
- restore state if valid
- clamp to nearest display perimeter
- if invalid, place on bottom edge near bottom-right of primary display

---

## Recommended Implementation Files

---

# 1. `pet-controller.js`

This is the main process feature module.

Responsibilities:
- create window
- own simulation state
- own behavior state machine
- move window
- save/load prefs
- send visual state to renderer

Suggested structure:

```js
class SnailPetController {
  constructor({ app, BrowserWindow, screen, assetDir, userDataPath }) {}

  createWindow() {}
  start() {}
  stop() {}
  show() {}
  hide() {}
  toggleVisibility() {}
  resetPosition() {}

  tick() {}
  tickMovement(dtMs) {}
  tickBehavior(now) {}

  setVisualState(state) {}
  chooseNextBehavior() {}

  getCurrentWorkArea() {}
  clampToPerimeter() {}
  advanceAlongEdge(distancePx) {}
  handleCorner() {}
  moveToNextEdge() {}
  reverseOnEdge() {}

  loadPrefs() {}
  savePrefs() {}
}
```

---

# 2. `pet-preload.js`

Minimal preload:

```js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('snailPetAPI', {
  onVisualState: (cb) => ipcRenderer.on('snail:visual-state', (_, payload) => cb(payload)),
  onConfig: (cb) => ipcRenderer.on('snail:config', (_, payload) => cb(payload)),
});
```

---

# 3. `pet.html`

Simple renderer shell:

```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <link rel="stylesheet" href="./pet.css" />
</head>
<body>
  <div id="pet-root">
    <div id="snail"></div>
  </div>
  <script src="./pet-renderer.js"></script>
</body>
</html>
```

---

# 4. `pet.css`

```css
html, body {
  margin: 0;
  width: 100%;
  height: 100%;
  background: transparent;
  overflow: hidden;
}

#pet-root {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

#snail {
  width: 96px;
  height: 96px;
  background-repeat: no-repeat;
  background-position: 0 0;
  background-size: auto 100%;
  image-rendering: pixelated;
  transform-origin: center center;
}
```

---

# 5. `pet-renderer.js`

The renderer should:
- receive current visual state
- play sheet animation using a timer or `requestAnimationFrame`
- flip sprite by applying `scaleX(-1)` when needed

Suggested implementation:

```js
const snail = document.getElementById('snail');

const SHEETS = {
  idle: {
    image: 'snail_idle_sprite.svg',
    frameWidth: 32,
    frameHeight: 32,
    frameCount: 4,
    frameDuration: 100,
  },
  move: {
    image: 'snail_move_sprite.svg',
    frameWidth: 32,
    frameHeight: 32,
    frameCount: 4,
    frameDuration: 100,
  },
  work: {
    image: 'snail_work_sprite.svg',
    frameWidth: 32,
    frameHeight: 32,
    frameCount: 8,
    frameDuration: 100,
  },
};

let currentState = 'idle';
let flipX = false;
let frameIndex = 0;
let lastFrameTime = performance.now();

function applySheet(state) {
  const sheet = SHEETS[state];
  snail.style.backgroundImage = `url("${sheet.image}")`;
  snail.style.backgroundSize = `${sheet.frameCount * 100}% 100%`;
}

function renderFrame() {
  const sheet = SHEETS[currentState];
  const xPercent = (frameIndex / Math.max(1, sheet.frameCount - 1)) * 100;
  snail.style.backgroundPosition = `${xPercent}% 0%`;
  snail.style.transform = flipX ? 'scaleX(-1)' : 'scaleX(1)';
}

function loop(now) {
  const sheet = SHEETS[currentState];
  if (now - lastFrameTime >= sheet.frameDuration) {
    frameIndex = (frameIndex + 1) % sheet.frameCount;
    lastFrameTime = now;
    renderFrame();
  }
  requestAnimationFrame(loop);
}

window.snailPetAPI.onVisualState((payload) => {
  const stateChanged = payload.state !== currentState;
  currentState = payload.state;
  flipX = !!payload.flipX;

  if (stateChanged) {
    frameIndex = 0;
    applySheet(currentState);
    renderFrame();
  } else {
    renderFrame();
  }
});

applySheet(currentState);
renderFrame();
requestAnimationFrame(loop);
```

### Note
The `%` based background-position trick works, but for maximum control you can also use pixel positions if preferred.

Pixel version:

```js
const framePixelX = frameIndex * 32;
snail.style.backgroundSize = `${sheet.frameCount * 96}px 96px`;
snail.style.backgroundPosition = `-${framePixelX * 3}px 0px`;
```

That can be more deterministic when scaling pixel art.

---

## Main Process Example Implementation

Below is a more complete example skeleton for Codex.

```js
const fs = require('fs');
const path = require('path');

class SnailPetController {
  constructor({ app, BrowserWindow, screen, assetDir }) {
    this.app = app;
    this.BrowserWindow = BrowserWindow;
    this.screen = screen;
    this.assetDir = assetDir;

    this.win = null;
    this.visible = true;
    this.paused = false;

    this.state = 'idle';
    this.lastNonVerticalFacing = 'right';

    this.edge = 'bottom';
    this.direction = -1;

    this.petSize = 96;
    this.tickMs = 50;
    this.speedPxPerSec = 22;

    this.simTimer = null;
    this.lastTick = 0;

    this.behaviorEndsAt = 0;
    this.lastState = null;

    this.prefsPath = path.join(this.app.getPath('userData'), 'snail-pet.json');
  }

  createWindow() {
    this.win = new this.BrowserWindow({
      width: this.petSize,
      height: this.petSize,
      x: 100,
      y: 100,
      frame: false,
      transparent: true,
      resizable: false,
      hasShadow: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      fullscreenable: false,
      focusable: false,
      webPreferences: {
        preload: path.join(__dirname, 'pet-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    });

    this.win.loadFile(path.join(__dirname, 'pet.html'));
    this.win.once('ready-to-show', () => {
      this.restoreOrPlace();
      this.pushVisualState();
    });
  }

  start() {
    if (!this.win) this.createWindow();
    if (this.simTimer) return;

    this.lastTick = Date.now();
    this.chooseNextBehavior(true);

    this.simTimer = setInterval(() => {
      this.tick();
    }, this.tickMs);
  }

  stop() {
    if (this.simTimer) clearInterval(this.simTimer);
    this.simTimer = null;
  }

  tick() {
    if (!this.win || this.win.isDestroyed() || this.paused) return;

    const now = Date.now();
    const dt = now - this.lastTick;
    this.lastTick = now;

    this.tickBehavior(now);

    if (this.state === 'move') {
      this.tickMovement(dt);
    }
  }

  tickBehavior(now) {
    if (now < this.behaviorEndsAt) return;
    this.chooseNextBehavior(false);
  }

  chooseNextBehavior(initial) {
    const prev = this.state;
    const r = Math.random();

    let next;
    if (prev === 'work') {
      next = r < 0.55 ? 'move' : 'idle';
    } else if (prev === 'idle') {
      next = r < 0.45 ? 'move' : (r < 0.85 ? 'idle' : 'work');
    } else {
      next = r < 0.35 ? 'idle' : (r < 0.85 ? 'move' : 'work');
    }

    this.state = initial ? 'idle' : next;

    if (this.state === 'idle') {
      this.behaviorEndsAt = Date.now() + this.rand(2000, 7000);
    } else if (this.state === 'move') {
      this.behaviorEndsAt = Date.now() + this.rand(3000, 10000);
    } else {
      this.behaviorEndsAt = Date.now() + this.rand(2000, 6000);
    }

    this.pushVisualState();
    this.savePrefs();
  }

  tickMovement(dtMs) {
    const distance = this.speedPxPerSec * (dtMs / 1000);
    this.advanceAlongEdge(distance);
  }

  advanceAlongEdge(distance) {
    const bounds = this.win.getBounds();
    const wa = this.getCurrentWorkArea(bounds);

    let x = bounds.x;
    let y = bounds.y;

    const left = wa.x;
    const top = wa.y;
    const right = wa.x + wa.width - bounds.width;
    const bottom = wa.y + wa.height - bounds.height;

    if (this.edge === 'top' || this.edge === 'bottom') {
      x += distance * this.direction;

      if (this.direction > 0) this.lastNonVerticalFacing = 'right';
      if (this.direction < 0) this.lastNonVerticalFacing = 'left';

      if (x >= right) {
        x = right;
        this.win.setBounds({ ...bounds, x: Math.round(x), y: Math.round(y) });
        return this.handleCorner('right');
      }

      if (x <= left) {
        x = left;
        this.win.setBounds({ ...bounds, x: Math.round(x), y: Math.round(y) });
        return this.handleCorner('left');
      }
    } else {
      y += distance * this.direction;

      if (y >= bottom) {
        y = bottom;
        this.win.setBounds({ ...bounds, x: Math.round(x), y: Math.round(y) });
        return this.handleCorner('bottom');
      }

      if (y <= top) {
        y = top;
        this.win.setBounds({ ...bounds, x: Math.round(x), y: Math.round(y) });
        return this.handleCorner('top');
      }
    }

    this.win.setBounds({ ...bounds, x: Math.round(x), y: Math.round(y) });
    this.pushVisualState();
  }

  handleCorner(cornerSide) {
    const continueAround = Math.random() < 0.65;

    if (!continueAround) {
      this.direction *= -1;
      this.pushVisualState();
      return;
    }

    const clockwiseMap = {
      top: 'right',
      right: 'bottom',
      bottom: 'left',
      left: 'top',
    };

    const counterMap = {
      top: 'left',
      left: 'bottom',
      bottom: 'right',
      right: 'top',
    };

    const movingClockwise =
      (this.edge === 'top' && this.direction > 0) ||
      (this.edge === 'right' && this.direction > 0) ||
      (this.edge === 'bottom' && this.direction < 0) ||
      (this.edge === 'left' && this.direction < 0);

    this.edge = movingClockwise ? clockwiseMap[this.edge] : counterMap[this.edge];

    if (this.edge === 'top') this.direction = cornerSide === 'right' ? -1 : 1;
    else if (this.edge === 'bottom') this.direction = cornerSide === 'right' ? -1 : 1;
    else if (this.edge === 'left') this.direction = cornerSide === 'top' ? 1 : -1;
    else if (this.edge === 'right') this.direction = cornerSide === 'top' ? 1 : -1;

    this.pushVisualState();
    this.savePrefs();
  }

  getCurrentWorkArea(bounds = null) {
    const b = bounds || this.win.getBounds();
    const point = { x: b.x + Math.floor(b.width / 2), y: b.y + Math.floor(b.height / 2) };
    const display = this.screen.getDisplayNearestPoint(point);
    return display.workArea;
  }

  restoreOrPlace() {
    const prefs = this.loadPrefs();
    if (prefs) {
      this.visible = prefs.visible !== false;
      this.paused = !!prefs.paused;
      this.state = prefs.state || 'idle';
      this.edge = prefs.edge || 'bottom';
      this.direction = typeof prefs.direction === 'number' ? prefs.direction : -1;
      this.lastNonVerticalFacing = prefs.flipX ? 'left' : 'right';

      const bounds = this.win.getBounds();
      this.win.setBounds({
        ...bounds,
        x: prefs.x ?? bounds.x,
        y: prefs.y ?? bounds.y,
      });
      this.snapToPerimeter();
    } else {
      const wa = this.screen.getPrimaryDisplay().workArea;
      const bounds = this.win.getBounds();
      this.edge = 'bottom';
      this.direction = -1;
      this.win.setBounds({
        ...bounds,
        x: wa.x + wa.width - bounds.width - 20,
        y: wa.y + wa.height - bounds.height,
      });
      this.snapToPerimeter();
    }

    if (!this.visible) this.win.hide();
  }

  snapToPerimeter() {
    const bounds = this.win.getBounds();
    const wa = this.getCurrentWorkArea(bounds);

    const left = wa.x;
    const top = wa.y;
    const right = wa.x + wa.width - bounds.width;
    const bottom = wa.y + wa.height - bounds.height;

    let x = bounds.x;
    let y = bounds.y;

    if (this.edge === 'top') y = top;
    else if (this.edge === 'bottom') y = bottom;
    else if (this.edge === 'left') x = left;
    else if (this.edge === 'right') x = right;

    x = Math.max(left, Math.min(x, right));
    y = Math.max(top, Math.min(y, bottom));

    this.win.setBounds({ ...bounds, x: Math.round(x), y: Math.round(y) });
  }

  pushVisualState() {
    if (!this.win || this.win.isDestroyed()) return;
    const flipX = this.lastNonVerticalFacing === 'left';
    this.win.webContents.send('snail:visual-state', {
      state: this.state,
      flipX,
    });
  }

  rand(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  loadPrefs() {
    try {
      return JSON.parse(fs.readFileSync(this.prefsPath, 'utf8'));
    } catch {
      return null;
    }
  }

  savePrefs() {
    if (!this.win || this.win.isDestroyed()) return;
    try {
      const bounds = this.win.getBounds();
      fs.writeFileSync(this.prefsPath, JSON.stringify({
        visible: this.visible,
        paused: this.paused,
        state: this.state,
        edge: this.edge,
        direction: this.direction,
        x: bounds.x,
        y: bounds.y,
        flipX: this.lastNonVerticalFacing === 'left',
      }, null, 2));
    } catch {}
  }
}

module.exports = { SnailPetController };
```

---

## Tray Integration Suggestions

Since your tray already exists, add a `Snail` submenu:

```js
{
  label: 'Snail',
  submenu: [
    { label: 'Show Snail', click: () => snail.show() },
    { label: 'Hide Snail', click: () => snail.hide() },
    { label: 'Pause Snail', type: 'checkbox', checked: false, click: (item) => snail.paused = item.checked },
    { label: 'Reset Snail Position', click: () => snail.resetPosition() },
  ]
}
```

### Optional extra settings
- size: 2x / 3x / 4x
- speed: slow / normal / fast
- behavior intensity: chill / normal / busy
- current monitor reset

---

## Code Quality Rules for Codex

Have Codex follow these rules:

1. Keep the feature self-contained under `src/pet/`.
2. Do not modify unrelated tray logic except to register the feature.
3. Do not add React or any UI framework.
4. Do not add physics libraries.
5. Do not create fullscreen or giant transparent windows.
6. Keep simulation in main process and animation in renderer.
7. Persist only lightweight JSON state.
8. Never rely on Aseprite `frameTags` for these specific files.
9. Derive sprite config explicitly from the exported JSON or hardcode it from known values.
10. Keep the renderer stateless apart from animation frame index.

---

## Handling the JSON Metadata

You already have the exported JSON files. Use them one of two ways.

### Option 1 — hardcode values
Simplest and safest:

```js
const SHEETS = {
  idle: { file: 'snail_idle_sprite.svg', frameCount: 4, frameDuration: 100, frameWidth: 32, frameHeight: 32 },
  move: { file: 'snail_move_sprite.svg', frameCount: 4, frameDuration: 100, frameWidth: 32, frameHeight: 32 },
  work: { file: 'snail_work_sprite.svg', frameCount: 8, frameDuration: 100, frameWidth: 32, frameHeight: 32 },
};
```

### Option 2 — parse JSON at startup
Better if you want flexibility later.

Example utility:

```js
const fs = require('fs');

function loadAsepriteSheetMeta(jsonPath) {
  const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const frames = Object.values(raw.frames || {});
  if (!frames.length) throw new Error(`No frames found in ${jsonPath}`);

  return {
    frameCount: frames.length,
    frameWidth: frames[0].frame.w,
    frameHeight: frames[0].frame.h,
    frameDuration: frames[0].duration,
    sheetWidth: raw.meta?.size?.w,
    sheetHeight: raw.meta?.size?.h,
    image: raw.meta?.image,
  };
}
```

For your specific files, hardcoding is perfectly fine.

---

## Suggested Defaults

```js
const DEFAULTS = {
  petScale: 3,
  petFrameSize: 32,
  petWindowSize: 96,
  tickMs: 50,
  moveSpeedPxPerSec: 22,
  idleDurationMin: 2000,
  idleDurationMax: 7000,
  moveDurationMin: 3000,
  moveDurationMax: 10000,
  workDurationMin: 2000,
  workDurationMax: 6000,
  cornerContinueChance: 0.65,
};
```

---

## Edge Cases to Handle

### 1. Display changes
If monitors are added/removed:
- find nearest display
- snap to that display perimeter
- do not let the pet get stranded off-screen

Recommended hooks:

```js
screen.on('display-added', () => snail.snapToPerimeter());
screen.on('display-removed', () => snail.snapToPerimeter());
screen.on('display-metrics-changed', () => snail.snapToPerimeter());
```

### 2. Hidden window
If hidden:
- stop sending visual updates if desired
- simulation can keep running or pause

Recommended:
- keep simulation paused while hidden

### 3. Renderer reload/crash
If renderer reloads:
- resend current visual state after `did-finish-load`

### 4. DPI scaling
Because the source art is tiny, prefer integer scale multipliers like `2x`, `3x`, `4x`.

---

## What Not To Build Yet

Avoid these in the first implementation:
- drag interaction
- input handling
- per-pixel hit testing
- fullscreen overlays
- bouncing inside the screen interior
- collision with app windows
- actual taskbar/window sitting detection
- pathfinding between monitors
- randomized rotations
- sound effects

The current goal is a **clean ambient perimeter crawler**.

---

## Suggested Codex Prompt

Use something like this with Codex:

```text
Add a new self-contained snail pet feature to my existing Electron tray app.

Requirements:
- use a single tiny transparent always-on-top BrowserWindow only
- do not use a fullscreen overlay
- do not add React or any framework
- put implementation under src/pet/
- use these sprite files already in the project directory:
  - snail_idle_sprite.svg / .json
  - snail_move_sprite.svg / .json
  - snail_work_sprite.svg / .json
- sprite facts:
  - idle: 4 frames, 32x32, 100ms/frame
  - move: 4 frames, 32x32, 100ms/frame
  - work: 8 frames, 32x32, 100ms/frame
- renderer should animate the sprite sheet and flip horizontally in code
- main process should manage the pet movement and behavior state machine
- the snail must move only along the perimeter of the current display work area (top/right/bottom/left edges)
- it can reverse direction or continue around corners randomly
- random behaviors: idle, move, work
- these behaviors are ambient and must not be tied to keystrokes or app activity
- persist state in a small JSON file under app.getPath('userData')
- integrate simple tray actions for show/hide/pause/reset if possible
- keep CPU and RAM usage low
- keep code modular and production-friendly

Please create:
- pet-controller.js
- pet-preload.js
- pet.html
- pet.css
- pet-renderer.js
- any tiny helper modules needed

Do not modify unrelated app behavior.
```

---

## Final Recommendation

Build this as a **small autonomous ambient pet module**.

The right implementation style is:
- one tiny overlay window
- one simple main-process simulation loop
- one simple renderer animation loop
- perimeter-only movement
- weighted random state changes
- horizontal flip only

This gives you a cute and clean SessionTrail pet without the complexity of fullscreen overlays, hitbox windows, or feature bloat.

