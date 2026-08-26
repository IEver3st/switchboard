/// <reference types="vite/client" />

import type { SwitchboardApi } from '../../shared/contracts';

declare global {
  interface Window {
    switchboard?: SwitchboardApi;
  }
}

export {};
