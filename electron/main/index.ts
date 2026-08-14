/**
 * Electron main process.
 *
 * A plain single-window desktop wrapper. Unlike Tomato Alarm this is not a
 * menu-bar app: it keeps a Dock icon and a normal window, because a question is
 * something you read standing up rather than glance at from the menu bar.
 *
 * The one genuinely fiddly part is the microphone. Recording is the whole point
 * of the app, and on macOS a packaged Electron app needs three separate things
 * lined up or getUserMedia fails silently:
 *
 *   1. NSMicrophoneUsageDescription in Info.plist   (electron-builder extendInfo)
 *   2. the audio-input entitlement                  (build/entitlements.mac.plist)
 *   3. an OS-level permission prompt                (askForMediaAccess, below)
 *
 * Plus Electron's own in-process permission handler, which defaults to denying.
 */

import { BrowserWindow, app, net, protocol, session, shell, systemPreferences } from 'electron';
import { electronApp, is, optimizer } from '@electron-toolkit/utils';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { bankDir, registerBankHandlers } from './bank';

/*
 * The renderer is served from app://, not file://, and this is not cosmetic.
 *
 * A file:// page is an opaque origin and not a secure context, which breaks the
 * two things this app is built on:
 *
 *   - IndexedDB is unavailable, so Dexie cannot open and every recording, point
 *     and note has nowhere to live. Boot fails before it even reads the bank.
 *   - getUserMedia is refused, because it requires a secure context. No amount of
 *     Info.plist or entitlement work fixes that.
 *
 * Registering a standard, secure scheme gives the app a real, stable origin
 * (app://-), so storage persists in userData and the microphone is allowed.
 * This must run before app ready.
 */
const APP_SCHEME = 'app';

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]);

const APP_ID = 'com.joynnncode.interviewgacha';

/*
 * Pin the app name before anything reads a path.
 *
 * Electron derives userData from app.getName(), which is package.json `name`
 * when unpackaged but electron-builder's `productName` once packaged. Left alone
 * that gives two different folders — "interview-gacha" in dev and "Interview
 * Gacha" in the built app — so the bank you dropped in one would be invisible to
 * the other, and your recordings would live in whichever you happened to run.
 * One name, one folder, both builds.
 */
app.setName('Interview Gacha');

/** Window size: the question text is large by design, so give it room. */
const WINDOW = {
  width: 1040,
  height: 860,
  minWidth: 720,
  minHeight: 640,
} as const;

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    ...WINDOW,
    show: false,
    title: 'Interview Gacha',
    // Match the cream background so launch does not flash white.
    backgroundColor: '#FDFBF7',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      // .cjs, because the preload imports named exports from the CJS `electron`
      // module. Getting this extension wrong silently loses the bridge, and the
      // app then reports "no question bank found".
      preload: join(__dirname, '../preload/index.cjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Show only once painted, so there is no empty frame first.
  window.on('ready-to-show', () => window.show());

  // Any external link opens in the real browser, never in the app window.
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  // Renderer errors are easy to miss in a packaged app, so surface them where the
  // main-process log already goes rather than requiring DevTools.
  window.webContents.on('console-message', (event) => {
    if (event.level === 'error' || event.level === 'warning') {
      console.error(`[renderer:${event.level}] ${event.message}`);
    }
  });

  // Whether the preload bridge arrived decides where the question bank comes
  // from, and a missing bridge otherwise shows up only as "no bank found".
  window.webContents.once('did-finish-load', () => {
    void window.webContents
      .executeJavaScript('typeof window.gacha')
      .then((type) => console.log(`[interview-gacha] preload bridge: ${type}`));
  });

  window.webContents.on('did-fail-load', (_event, code, description, url) => {
    console.error(`[renderer] failed to load ${url}: ${description} (${code})`);
  });

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void window.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    void window.loadURL(`${APP_SCHEME}://-/index.html`);
  }

  return window;
}

/** Serve the built renderer over app://, with traversal outside it refused. */
function registerAppProtocol(): void {
  const rendererRoot = join(__dirname, '../renderer');

  protocol.handle(APP_SCHEME, async (request) => {
    const { pathname } = new URL(request.url);
    const filePath = join(rendererRoot, decodeURIComponent(pathname));

    if (!filePath.startsWith(rendererRoot)) {
      return new Response('Not found', { status: 404 });
    }

    return net.fetch(pathToFileURL(filePath).toString());
  });
}

/**
 * Grant microphone access to our own renderer, and deny everything else.
 *
 * Electron denies permission requests by default, so without this the recorder
 * fails with NotAllowedError even when macOS itself has granted access.
 */
function configureMediaPermissions(): void {
  // getUserMedia surfaces as the 'media' permission. Everything else is denied:
  // this app has no business asking for geolocation, notifications or the rest.
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media');
  });

  // Chromium also checks synchronously in some flows.
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return permission === 'media';
  });
}

/** Ask macOS for microphone access up front, so the prompt is not a surprise mid-answer. */
async function requestMicrophoneAccess(): Promise<void> {
  if (process.platform !== 'darwin') return;

  const status = systemPreferences.getMediaAccessStatus('microphone');
  if (status === 'granted') return;

  // 'not-determined' shows the OS prompt. 'denied' returns false immediately and
  // the app has to tell the user to change it in System Settings — which the
  // recorder's own copy already does.
  const granted = await systemPreferences.askForMediaAccess('microphone');
  if (!granted) {
    console.warn(
      '[interview-gacha] Microphone access not granted. Recording will not work until it is ' +
        'enabled in System Settings → Privacy & Security → Microphone.',
    );
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId(APP_ID);

  app.on('browser-window-created', (_event, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  registerAppProtocol();
  configureMediaPermissions();
  registerBankHandlers();

  // Printed once at startup so it is obvious where to drop my own bank.
  console.log(`[interview-gacha] Put your questions.seed.json in: ${bankDir()}`);

  await requestMicrophoneAccess();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // A normal windowed app: closing the last window quits, except on macOS where
  // staying in the Dock is the platform convention.
  if (process.platform !== 'darwin') app.quit();
});
