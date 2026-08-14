/**
 * The question bank, on the desktop.
 *
 * On the web the bank is fetched from the app's own origin. That cannot work
 * from a packaged app: the renderer loads over file://, so an absolute path like
 * /questions.seed.json resolves to the filesystem root. So the main process
 * reads it from disk instead and hands it over by IPC.
 *
 * Where it reads from matters, and this is deliberate:
 *
 *   1. <userData>/questions.seed.json  — my real bank, if I have put it there
 *   2. the bundled questions.example.json — the fictional fallback
 *
 * The real bank is NEVER bundled into the .app. If it were, `build:mac` would
 * produce a dmg containing my salary expectations and right-to-work answers, and
 * this is a project I show people. Keeping it in userData means the app itself is
 * always safe to hand over, and it also means I can edit my questions and hit
 * "Reload from file" without rebuilding anything.
 */

import { app, ipcMain } from 'electron';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export type BankSource = 'seed' | 'example';

export interface BankPayload {
  source: BankSource;
  /** Where it was read from, so the UI can tell me where to put my own file. */
  path: string;
  /** Parsed bank. Validated on the renderer side by the existing type guard. */
  data: unknown;
}

/** Folder I drop my own questions.seed.json into. */
export function bankDir(): string {
  return app.getPath('userData');
}

/**
 * The fictional fallback bank.
 *
 * Shipped as an electron-builder extraResource rather than through Vite's
 * publicDir, so that exactly one bank file gets packaged and it is provably the
 * fictional one. See the publicDir comment in electron.vite.config.ts.
 */
function bundledExamplePath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'questions.example.json')
    : join(app.getAppPath(), 'public', 'questions.example.json');
}

async function tryReadJson(path: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    // Missing or malformed: fall through to the next candidate, exactly as the
    // web version does.
    return null;
  }
}

export async function readBank(): Promise<BankPayload | null> {
  const seedPath = join(bankDir(), 'questions.seed.json');
  const seed = await tryReadJson(seedPath);
  if (seed) return { source: 'seed', path: seedPath, data: seed };

  const examplePath = bundledExamplePath();
  const example = await tryReadJson(examplePath);
  if (example) return { source: 'example', path: examplePath, data: example };

  return null;
}

export function registerBankHandlers(): void {
  ipcMain.handle('bank:read', async () => {
    const payload = await readBank();

    // Logged because the desktop build has no address bar to sanity-check: if the
    // app ever shows five questions instead of my own bank, this line says whether
    // it fell back to the example file and exactly which path it read.
    if (payload) {
      const count = Array.isArray((payload.data as { questions?: unknown[] }).questions)
        ? (payload.data as { questions: unknown[] }).questions.length
        : 0;
      console.log(`[interview-gacha] bank: ${payload.source}, ${count} questions, ${payload.path}`);
    } else {
      console.warn('[interview-gacha] bank: none found');
    }

    return payload;
  });

  ipcMain.handle('bank:dir', () => bankDir());
}
