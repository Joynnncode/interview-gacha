/**
 * The desktop bridge, as the renderer sees it.
 *
 * The same source builds both the web app and the Electron app, so nothing may
 * assume it is running in one or the other. `isDesktop()` is the only check, and
 * every desktop-only path has a web fallback beside it.
 */

export interface DesktopBankPayload {
  source: 'seed' | 'example';
  /** Where the file was read from, so Settings can show it. */
  path: string;
  data: unknown;
}

export interface DesktopBridge {
  readBank(): Promise<DesktopBankPayload | null>;
  bankDir(): Promise<string>;
  /**
   * Ask macOS for camera access, resolving true if it was granted. Only the
   * packaged app needs this; in a browser the getUserMedia prompt is enough.
   */
  requestCameraAccess(): Promise<boolean>;
}

declare global {
  interface Window {
    /** Injected by electron/preload. Absent in the browser. */
    gacha?: DesktopBridge;
  }
}

/** The bridge, or undefined when running as a normal web page. */
export function desktopBridge(): DesktopBridge | undefined {
  return typeof window === 'undefined' ? undefined : window.gacha;
}

export function isDesktop(): boolean {
  return desktopBridge() !== undefined;
}
