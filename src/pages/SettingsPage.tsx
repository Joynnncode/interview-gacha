/**
 * Settings, plus the export and import that make local-only storage safe.
 *
 * The export button is the most important control in the app: it is the only
 * thing standing between a cleared browser store and losing everything.
 */

import { useRef, useState } from 'react';
import { Button, Card, SectionHeading, formatDate } from '../components/ui';
import { GazeSettings } from '../components/GazeSettings';
import { refreshBankFromFile } from '../db/bank';
import { renamePet, updateSettings } from '../db/actions';
import { downloadExport, importBundle } from '../db/transfer';
import { usePet, useQuestions, useSettings } from '../hooks/useAppData';
import { useSystemReducedMotion } from '../hooks/useReducedMotion';
import type { Category } from '../types';

export function SettingsPage() {
  const settings = useSettings();
  const pet = usePet();
  const questions = useQuestions();
  const systemReducedMotion = useSystemReducedMotion();

  const [petName, setPetName] = useState(pet.name);
  const [status, setStatus] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [confirmImport, setConfirmImport] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const toggleCategory = (category: Category) => {
    const current = settings.drawCategories;
    const next = current.includes(category)
      ? current.filter((c) => c !== category)
      : [...current, category];
    // Never leave the pool empty — an empty pool means the machine cannot be pulled.
    if (next.length === 0) return;
    void updateSettings({ drawCategories: next });
  };

  const handleImportFile = async (file: File) => {
    setImporting(true);
    setStatus(null);
    try {
      const result = await importBundle(await file.text());
      setStatus(
        `Restored ${result.questions} questions, ${result.sessions} sessions and ${result.recordings} recordings.`,
      );
      setConfirmImport(false);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'That file could not be imported.');
    } finally {
      setImporting(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <SectionHeading hint="Your data never leaves this browser. These buttons are how you move it.">
          Backup
        </SectionHeading>

        <div className="flex flex-wrap gap-3">
          <Button tone="primary" onClick={() => void downloadExport({ includeAudio: false })}>
            ⬇ Export everything (JSON)
          </Button>
          <Button onClick={() => void downloadExport({ includeAudio: true })}>
            ⬇ Export with recordings
          </Button>
        </div>
        <p className="mt-3 text-sm text-ink-soft">
          The plain export holds every question, session, badge and note. Including recordings makes
          the file much larger, so keep that one for occasional full backups.
        </p>

        <hr className="my-6 border-cream-deep" />

        <h3 className="font-bold text-ink">Import a backup</h3>
        <p className="mt-1 text-sm text-ink-soft">
          Importing replaces everything currently stored, because merging two different histories of
          a single-player game would produce nonsense. Export first if you are unsure.
        </p>

        {confirmImport ? (
          <div className="mt-4 rounded-toy bg-cream-deep p-4">
            <p className="text-sm font-semibold text-ink">
              This will replace all current data. Choose the file to restore from.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <input
                ref={fileInput}
                type="file"
                accept="application/json,.json"
                disabled={importing}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleImportFile(file);
                }}
                className="text-sm text-ink"
              />
              <Button tone="quiet" onClick={() => setConfirmImport(false)} disabled={importing}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <Button onClick={() => setConfirmImport(true)}>⬆ Import from a backup file</Button>
          </div>
        )}

        {status ? <p className="mt-4 text-sm font-semibold text-ink">{status}</p> : null}
      </Card>

      <Card>
        <SectionHeading hint="What the machine is allowed to draw from.">The draw</SectionHeading>

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-ink">Categories</legend>
          {(['behavioral', 'tech'] as Category[]).map((category) => (
            <label key={category} className="flex items-center gap-3 text-sm text-ink">
              <input
                type="checkbox"
                checked={settings.drawCategories.includes(category)}
                onChange={() => toggleCategory(category)}
                className="h-5 w-5 rounded-md accent-peach"
              />
              {category === 'behavioral' ? 'Behavioural questions' : 'Tech questions'}
            </label>
          ))}
        </fieldset>

        <label className="mt-5 flex items-start gap-3 text-sm text-ink">
          <input
            type="checkbox"
            checked={settings.skipNeedsInput}
            onChange={(event) => void updateSettings({ skipNeedsInput: event.target.checked })}
            className="mt-0.5 h-5 w-5 rounded-md accent-peach"
          />
          <span>
            Skip questions that still have placeholders
            <span className="block text-xs text-ink-soft">
              Leaves out anything marked needsInput until you have filled in the real details.
            </span>
          </span>
        </label>
      </Card>

      <GazeSettings settings={settings} />

      <Card>
        <SectionHeading>Motion</SectionHeading>
        <p className="text-sm text-ink-soft">
          Your system preference is currently{' '}
          <strong className="text-ink">{systemReducedMotion ? 'reduced motion' : 'full motion'}</strong>.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {[
            { value: null, label: 'Follow my system' },
            { value: true, label: 'Always reduced' },
            { value: false, label: 'Always full' },
          ].map((option) => (
            <button
              key={String(option.value)}
              type="button"
              onClick={() => void updateSettings({ reducedMotion: option.value })}
              className={`toy-press rounded-full px-4 py-1.5 text-sm font-semibold ${
                settings.reducedMotion === option.value
                  ? 'bg-peach text-white shadow-soft'
                  : 'bg-cream-deep text-ink-soft hover:text-ink'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <SectionHeading>Your pet</SectionHeading>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm text-ink">
            <span className="mb-1 block font-semibold">Name</span>
            <input
              type="text"
              value={petName}
              onChange={(event) => setPetName(event.target.value)}
              maxLength={24}
              className="rounded-toy bg-cream-deep/70 px-4 py-2.5 text-base text-ink"
            />
          </label>
          <Button onClick={() => void renamePet(petName)}>Rename</Button>
        </div>
      </Card>

      <Card>
        <SectionHeading hint="Where the questions came from, and how to pick up edits.">
          Question bank
        </SectionHeading>
        <dl className="space-y-2 text-sm">
          <div className="flex gap-2">
            <dt className="text-ink-soft">Questions loaded</dt>
            <dd className="font-semibold text-ink">{questions?.length ?? 0}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-ink-soft">Source file</dt>
            <dd className="font-semibold text-ink">
              {settings.bankSource === 'seed'
                ? 'questions.seed.json'
                : settings.bankSource === 'example'
                  ? 'questions.example.json (fictional sample bank)'
                  : 'imported backup'}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-ink-soft">Imported</dt>
            <dd className="font-semibold text-ink">{formatDate(settings.bankImportedAt)}</dd>
          </div>
        </dl>

        <div className="mt-4">
          <Button
            onClick={() => {
              void (async () => {
                try {
                  const result = await refreshBankFromFile();
                  setStatus(
                    `Reloaded ${result.imported} questions from ${
                      result.source === 'seed' ? 'questions.seed.json' : 'questions.example.json'
                    }. Your progress was kept.`,
                  );
                } catch (error) {
                  setStatus(error instanceof Error ? error.message : 'Could not reload the bank.');
                }
              })();
            }}
          >
            Reload from file
          </Button>
        </div>
        <p className="mt-3 text-sm text-ink-soft">
          Use this after editing the bank by hand. Existing questions keep their answer counts and
          dates; questions you deleted from the file stay in the collection so their history survives.
        </p>
      </Card>
    </div>
  );
}
