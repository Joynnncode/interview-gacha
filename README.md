# Interview Gacha 🎰

A small desktop web game for interview practice. Your own interview questions sit inside a gacha
machine. You pull the lever, get one question, and answer it **out loud** into your microphone.
Only once the recording exists does the app unlock the reference answer.

It is built for one person — whoever is running it — and it keeps everything on that person's own
machine. There is no backend, no account and no network call.

```
draw a question  →  answer it out loud and record  →  rate how it felt  →  unlock the answer
                                          ↓
                              points · a pet that grows · a collection to fill
```

## Why it works this way

Reading a model answer teaches you to *recognise* a good answer. Saying one out loud teaches you to
*produce* one. Those are different skills, and only the second one helps in the room.

So the app enforces an order that is mildly annoying and quite effective:

1. **The question appears on its own.** No beats, no reference answer, no hints.
2. **You record yourself answering.** Standing up is encouraged; the question text is deliberately large.
3. **You rate how it felt** — shaky, got there, or solid — *before* seeing the reference answer, so
   the rating measures your attempt rather than how well the reference answer reads.
4. **Then the answer unlocks:** the beats to memorise, a full reference answer, and a note on what
   the question is really testing.

Two design decisions follow from this and are worth stating plainly:

- **Points come from finishing a recording, never from answering well.** A "shaky" rating earns
  exactly the same points as a "solid" one. It only changes how soon that question comes round again.
- **The pet droops when you are away, and that is all it ever does.** It does not die, does not
  disappear, and never guilts you.

## Screenshots

<!-- Add screenshots here: the machine on the draw screen, a question mid-recording,
     the reveal with the beats, and the collection grid. -->

_To come._

## Getting started

Requires Node 18 or newer.

```bash
npm install
npm run dev
```

That is it — it opens on `http://localhost:5173`.

On first run the app imports a question bank into IndexedDB. It looks for
`public/questions.seed.json` first and falls back to `public/questions.example.json`, which ships
with the repo and contains five entirely fictional questions. So a fresh clone runs immediately with
sample content.

Your browser will ask for microphone permission the first time you record. If you decline, the app
tells you how to re-enable it and the question stays where it is.

### Adding your own questions

Create `public/questions.seed.json` following the shape of `public/questions.example.json`, then
either reload (on a fresh database) or press **Reload from file** in Settings, which merges the file
over what is stored while keeping your answer counts and dates.

Each question looks like this:

```json
{
  "id": "B01",
  "category": "behavioral",
  "topic": "Opening & motivation",
  "question": "Tell me about yourself.",
  "likelihood": "high",
  "rarity": "SSR",
  "timeTargetSec": 75,
  "beats": ["Where you started", "What you moved towards", "So why this role"],
  "modelAnswer": "The reference answer, unlocked only after recording.",
  "coach": "What this question is really testing.",
  "companySpecific": false,
  "needsInput": false,
  "tags": ["opening", "must-know"]
}
```

| Field | What it does |
| --- | --- |
| `category` | `behavioral` (warm pink) or `tech` (mint green) |
| `likelihood` | `high` / `medium` / `low` — how often it comes up in a real interview, which drives the draw weight |
| `rarity` | `N` / `R` / `SR` / `SSR` — the gacha tier. SSR doubles the points |
| `timeTargetSec` | Roughly how long the spoken answer should be. A soft guide, never enforced |
| `beats` | The structure to memorise. This is the thing you are actually learning |
| `needsInput` | `true` if the answer still has `<placeholders>`. Optionally excluded from the draw in Settings |
| `companySpecific` | `true` if the answer must be rewritten per target company |

> **Privacy:** `public/questions.seed.json` is gitignored on purpose. A real bank contains salary
> expectations, personal history and right-to-work answers. Keep it out of version control.

## Your data

Everything lives in your browser's IndexedDB. Recordings are stored as audio Blobs, not as text.
Nothing is uploaded anywhere, there is no analytics, and the app makes no third-party requests —
even the typeface is a system font rather than a webfont, for exactly that reason.

The flip side is that clearing your browser storage deletes it. So **Settings → Backup** has
one-click export:

- **Export everything (JSON)** — questions, sessions, badges, notes, pet and settings. Small file.
- **Export with recordings** — the same plus every audio recording, base64-encoded inside the JSON.
  Much larger; good for occasional full backups.

Import restores from either file. It replaces what is currently stored rather than merging, because
merging two divergent histories of a single-player game produces nonsense.

## How the draw works

The draw is weighted rather than uniform, so practice lands where it is useful:

- A `high` likelihood question is drawn about 4× as often as a `low` one.
- A question you have never seen is favoured about 2.5×.
- One you rated **shaky** comes back roughly 4× sooner than one you rated **solid**.
- Anything answered in the last three days is heavily down-weighted so you do not repeat yourself.
- Rarity barely affects the odds. This is a study tool wearing a gacha costume, and making the
  highest-leverage questions rare would be exactly backwards.
- A pity counter guarantees an SSR at least every 8 draws.

Every one of those numbers lives in `src/game/config.ts`. Change them there.

## Stack

- [Vite](https://vite.dev) + React 18 + TypeScript
- [Tailwind CSS](https://tailwindcss.com) v4 — all colours are tokens in `src/index.css`
- [Framer Motion](https://motion.dev) — the capsule drop and crack-open
- [Dexie.js](https://dexie.org) + `dexie-react-hooks` for IndexedDB and reactive reads
- The native `MediaRecorder` API for audio. No recording library

Accessibility and motion: the app honours `prefers-reduced-motion`, and Settings can override it in
either direction for machines where no system preference is set.

## Project layout

```
public/
  questions.seed.json      your real bank (gitignored)
  questions.example.json   fictional sample bank, committed
src/
  types.ts                 all type definitions
  game/
    config.ts              every tunable number: weights, points, pity, pet, badges
    flow.ts                the four-stage state machine and the spoiler gate
    draw.ts                weighted draw + pity counter
    rewards.ts             points, streaks, pet growth, badge conditions (pure)
  db/
    db.ts                  Dexie schema
    bank.ts                first-run import, seed → example fallback
    actions.ts             every write that advances the game
    transfer.ts            JSON export / import
  hooks/                   useRecorder, useLiveQuery reads, motion preference
  components/              gacha machine, question card, the four stage panels, pet
  pages/                   Draw · Collection · History · Settings
```

The one file to read first is `src/game/flow.ts`. `isAnswerUnlocked()` is the single gate on the
reference answer, and `SafeQuestion` is a `Question` with the spoiler fields removed so that leaking
an answer early is a compile error rather than something to catch in review.

## Commands

```bash
npm run dev        # local dev server
npm run build      # production build
npm run preview    # preview the production build
npm run typecheck  # types only
```

## Licence

Personal project, no licence granted. The sample questions in `questions.example.json` are fictional
and free to reuse as a template.
