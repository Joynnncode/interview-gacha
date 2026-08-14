/**
 * App shell: boot the database, then show one of four screens.
 *
 * Routing is a piece of local state rather than a router. There are four screens
 * and no URLs to share, so a router would be weight without benefit.
 */

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { PetSpinner } from './components/PetSpinner';
import { DrawPage } from './pages/DrawPage';
import { CollectionPage } from './pages/CollectionPage';
import { HistoryPage } from './pages/HistoryPage';
import { SettingsPage } from './pages/SettingsPage';
import { ensureBankImported } from './db/bank';
import { ensureBaseRecords, refreshPetMood } from './db/actions';
import { usePet } from './hooks/useAppData';
import { useReducedMotion } from './hooks/useReducedMotion';

type Screen = 'draw' | 'collection' | 'history' | 'settings';

const NAV: Array<{ id: Screen; label: string; icon: string }> = [
  { id: 'draw', label: 'Draw', icon: '🎰' },
  { id: 'collection', label: 'Collection', icon: '🧺' },
  { id: 'history', label: 'History', icon: '📜' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
];

type BootState = { status: 'loading' } | { status: 'ready' } | { status: 'failed'; message: string };

export default function App() {
  const [screen, setScreen] = useState<Screen>('draw');
  const [boot, setBoot] = useState<BootState>({ status: 'loading' });
  const pet = usePet();
  const reducedMotion = useReducedMotion();

  // Boot: create the singleton rows, import the bank on first run, and let the
  // pet react to how long it has been. All local, no network beyond our own files.
  useEffect(() => {
    void (async () => {
      try {
        await ensureBaseRecords();
        await ensureBankImported();
        await refreshPetMood();
        setBoot({ status: 'ready' });
      } catch (error) {
        setBoot({
          status: 'failed',
          message: error instanceof Error ? error.message : 'Something went wrong starting up.',
        });
      }
    })();
  }, []);

  // Expose the motion preference to CSS, so the override works without a system
  // preference set. See the data-reduced-motion rules in index.css.
  useEffect(() => {
    document.documentElement.dataset.reducedMotion = String(reducedMotion);
  }, [reducedMotion]);

  if (boot.status === 'loading') {
    return (
      <main className="flex min-h-full items-center justify-center p-8">
        <PetSpinner size="lg" label="Opening the machine…" />
      </main>
    );
  }

  if (boot.status === 'failed') {
    return (
      <main className="mx-auto flex min-h-full max-w-lg items-center p-8">
        <div className="rounded-toy-lg bg-card p-6 shadow-soft">
          <h1 className="text-xl font-bold text-ink">The machine could not start</h1>
          <p className="mt-2 text-sm text-ink-soft">{boot.message}</p>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-full">
      <header className="border-b border-cream-deep bg-cream/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-4 px-6 py-4">
          <h1 className="text-lg font-bold text-ink">
            Interview&nbsp;Gacha
          </h1>

          {/* Pet summary, always visible so the reward is never buried. */}
          <p className="text-sm text-ink-soft">
            {pet.name} · {pet.totalPoints} points
            {pet.streakDays > 0 ? ` · ${pet.streakDays}-day streak` : ''}
          </p>

          <nav className="ml-auto flex gap-1">
            {NAV.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setScreen(item.id)}
                aria-current={screen === item.id ? 'page' : undefined}
                className={`toy-press rounded-toy px-3 py-2 text-sm font-semibold ${
                  screen === item.id
                    ? 'bg-card text-ink shadow-soft'
                    : 'text-ink-soft hover:bg-card/60 hover:text-ink'
                }`}
              >
                <span className="mr-1.5" aria-hidden="true">
                  {item.icon}
                </span>
                {item.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/*
        Page transition: a gentle fade with a slight upward drift. mode="wait"
        lets the outgoing screen finish leaving before the next arrives, so the
        two never overlap and slide past each other.
      */}
      <main className="mx-auto max-w-3xl px-6 py-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={screen}
            initial={reducedMotion ? { opacity: 1 } : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reducedMotion ? { opacity: 1 } : { opacity: 0, y: -8 }}
            transition={{ duration: reducedMotion ? 0 : 0.28, ease: 'easeOut' }}
          >
            {screen === 'draw' ? <DrawPage /> : null}
            {screen === 'collection' ? <CollectionPage /> : null}
            {screen === 'history' ? <HistoryPage /> : null}
            {screen === 'settings' ? <SettingsPage /> : null}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
