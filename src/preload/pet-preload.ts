import { contextBridge, ipcRenderer } from "electron";

type SnailPetVisualState = {
  state: "idle" | "move" | "work";
  rotationDeg: number;
  flipX: boolean;
  renderScale: 2 | 3 | 4;
  windowSize: number;
  frameDurationMs: number;
};

contextBridge.exposeInMainWorld("snailPetAPI", {
  onVisualState: (listener: (payload: SnailPetVisualState) => void) => {
    const wrappedListener = (
      _event: Electron.IpcRendererEvent,
      payload: SnailPetVisualState
    ) => {
      listener(payload);
    };

    ipcRenderer.on("snail-pet:visual-state", wrappedListener);

    return () => {
      ipcRenderer.off("snail-pet:visual-state", wrappedListener);
    };
  }
});
