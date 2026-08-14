/**
 * Preload bridge.
 *
 * The renderer keeps context isolation on and has no Node access, so this is the
 * only surface between the app and the main process. It is deliberately tiny:
 * reading the question bank is the single thing the desktop build needs that the
 * web build gets from fetch().
 *
 * Note what is NOT here: no filesystem write, no shell, no arbitrary IPC. The
 * recordings stay in IndexedDB exactly as they do on the web — the desktop build
 * changes where the bank comes from, and nothing else.
 */

import { contextBridge, ipcRenderer } from 'electron';

const bridge = {
  /** The bank, read from userData or the bundled fictional fallback. */
  readBank: (): Promise<{ source: 'seed' | 'example'; path: string; data: unknown } | null> =>
    ipcRenderer.invoke('bank:read'),

  /** Where to drop my own questions.seed.json. Shown in Settings. */
  bankDir: (): Promise<string> => ipcRenderer.invoke('bank:dir'),
};

contextBridge.exposeInMainWorld('gacha', bridge);

export type GachaBridge = typeof bridge;
