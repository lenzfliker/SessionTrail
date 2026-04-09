/// <reference types="vite/client" />

import type { SessionTrailApi } from "../shared/contracts";

declare global {
  interface Window {
    sessionTrail: SessionTrailApi;
  }
}

export {};

