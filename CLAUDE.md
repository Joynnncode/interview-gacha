# Interview Gacha

A cute desktop web game, built for one user only: me. My own interview questions live inside a gacha machine, and I draw one every day to practise.

Core loop: draw a question → answer it out loud and record it → recording unlocks the reference answer → self-rate → earn points, raise a pet, fill a collection.

---

## Stack (follow strictly, do not substitute)

- Vite + React 18 + TypeScript
- Tailwind CSS
- Framer Motion (animation)
- Dexie.js (IndexedDB wrapper)
- Native browser MediaRecorder API (audio recording)
- `@mediapipe/tasks-vision` Face Landmarker, for the optional eye-contact tracking. Its wasm
  runtime and its model file are imported with Vite's `?url` and served from this origin —
  never from Google's CDN, which would break rule 3.
- Frontend only. No backend, no accounts, no network calls.

If you think a stack choice should change, ask me first. Do not swap it silently.

---

## Non-negotiable rules

1. **Never render `beats`, `modelAnswer` or `coach` before a recording exists.** This is the entire reason the app exists. If a change could leak the answer before recording, stop and ask me.
2. **Self-rating happens before the answer is revealed.** The order is: record → self-rate → unlock answer. Do not swap these to make the flow feel smoother.
3. All data stays in local IndexedDB. Never upload anything, anywhere. No analytics, no telemetry, no third-party requests.
4. Store recordings as Blobs. Do not convert them to base64 strings.
5. Single user. No multi-user, no login, no permissions, no collaboration.
6. There must always be a one-click export/import of all data as JSON.
7. Rewards are tied to **completing a recording**, never to answering well. A low self-rating must never subtract points, never make the pet droop, and never trigger negative copy.
8. The pet droops but never dies and never disappears. No guilt-inducing copy of any kind ("it misses you", "it's hungry", crying emoji, etc.).
9. **Eye-contact tracking never stores a video frame.** Frames are measured and dropped in the
   same instant. No canvas capture, no video Blob, no `MediaRecorder` on the camera stream, and
   nothing about the camera in the export bundle beyond the numbers on the session. If a change
   would put a frame anywhere it could persist, stop and ask me.
10. Eye contact is subject to rule 7 like everything else: it never adds points, never subtracts
    them, never touches the pet or a badge, and never gets scolding copy. It is information.

### How rules 1 and 2 are enforced in code

- `isAnswerUnlocked(session)` in `src/game/flow.ts` is the **single gate**. It requires stage `revealed` **and** a self-rating **and** a non-zero recording duration. No component may invent its own condition.
- `SafeQuestion` / `stripAnswer()` in the same file give a `Question` with the three spoiler fields removed. Any component that renders before the reveal takes a `SafeQuestion`, so leaking the answer early is a **type error**, not a code-review question.
- The flow's legal transitions live in `ALLOWED_TRANSITIONS`; every database write that changes stage calls `assertTransition` first, so `drawn → revealed` throws instead of silently succeeding.

---

### How rule 9 is enforced in code

- `src/vision/landmarks.ts` turns a frame's landmarks into exactly four numbers plus an eye-openness
  value. It has no MediaPipe import at all, which is also why it is testable without a browser.
- `useGazeTracker` never creates a canvas and never attaches a recorder to the camera stream. The
  only consumer of the `<video>` element is `readFrame`, which reads and returns numbers.
- `src/db/gaze.test.ts` asserts that a terrible eye-contact summary earns exactly the same points as
  a perfect one, and that the only Blob in the database is audio. That test is the guard rail.

## Language rule (important)

**Everything is in English. No Chinese anywhere.** This applies to:

- The entire UI: buttons, labels, navigation, headings, tooltips, empty states, loading states, error messages, permission prompts
- Badge names, pet status descriptions, chart axis labels and legends
- All code comments
- `README.md`, all repo documentation, issue and PR templates
- Commit messages
- This file

Date formatting follows English convention: `13 August 2026` or `13 Aug 2026`.

Write copy in English from the start. Do not draft in another language and translate.

---

## GitHub

This repo will be pushed to GitHub.

- `README.md` in English: what it is, screenshots, setup steps, stack notes.
- Commit messages in English, conventional style: `feat: gacha capsule crack-open animation`, `fix: white screen when mic permission denied`, `refactor: extract draw weights into config`.
- Code comments in English.

**Privacy: the question bank must never be committed.** `public/questions.seed.json` contains my real interview material — salary expectations, personal history, right-to-work answers. It must be in `.gitignore`.

Also maintain `public/questions.example.json` with 3–5 entirely fictional sample questions so anyone cloning the repo can run it. The first-run import logic must handle the seed file being absent and fall back to the example file.

Note on how that fallback actually works: under the Vite dev server a missing file returns `index.html` with a **200**, so the status code proves nothing. `tryLoadBankFile` in `src/db/bank.ts` treats a failed `JSON.parse` or a failed structural check as "absent" and falls through to the example file. Do not "simplify" that to a `response.ok` check.

`.gitignore` must include at least:

```
node_modules/
dist/
public/questions.seed.json
*.local
.DS_Store
recordings-export/
```

---

## Deployment

Live at **https://interview-gacha.vercel.app**, deployed on Vercel with Git integration:
every push to `main` builds and goes to production automatically. No build config is
needed — Vercel detects Vite, runs `npm run build`, and serves `dist`.

**The deployed site is a showcase, not where I practise.** The real bank is gitignored, so
Vercel only ever has `questions.example.json` and the site runs on the five fictional
questions. My actual practice — my real bank, my recordings, my points — lives in
localhost's IndexedDB and is per-origin, so it does not exist on the deployed site and
never leaves this machine. Practise on `npm run dev`; send people the Vercel link.

Two things to be careful about:

1. **Prefer letting Git integration build.** `vercel` run by hand uploads the *local*
   folder, where `public/questions.seed.json` does exist. `.vercelignore` guards against
   that, but a deploy built from the repo cannot contain the file at all, which is a
   stronger guarantee than a correctly-written ignore file. If a manual deploy is ever
   genuinely needed, move the seed bank out of the folder first and verify afterwards that
   `/questions.seed.json` returns 404 on the live site.
2. **`.vercel/` and `.env.local` are local-only.** The CLI writes project ids and an OIDC
   token there. Both are gitignored and must stay that way.

---

## Desktop app (Electron)

Same stack as Tomato Alarm: Electron + electron-vite + electron-builder.

```bash
npm run desktop          # dev, with HMR (renderer served over http://localhost)
npm run desktop:build    # build main + preload + renderer into out/
npm run desktop:mac      # package into release/ as .dmg and .zip
npm run desktop:install  # the above, then copy the .app into /Applications
npm run icon             # redraw build/icon.png and build/icon.icns
```

Day to day this is a normal Mac app: `npm run desktop:install` once, then open it from
Launchpad, Spotlight or the Dock. Rebuilding just replaces `/Applications/Interview
Gacha.app`; the data lives in userData, not in the bundle, so nothing is lost.

The web app is untouched by all of this. `npm run dev` and `npm run build` still
work, `dist/` is still the web output, and Vercel still deploys from the same source.
Desktop artefacts go to `release/` — they used to collide in `dist/`.

**The origin decides where your data lives, and it must not change.** IndexedDB is
per-origin, and each way of running the app is a different origin:

| How it runs | Origin | Data |
| --- | --- | --- |
| `npm run dev` | `http://localhost:5173` | the browser copy |
| `npm run desktop` | `http://localhost:<port>` | a separate dev copy |
| the packaged `.app` | `app://-` | **the real one** |

So practise in the **packaged app**, and treat `npm run desktop` as development only.
Changing the `APP_SCHEME` in `electron/main/index.ts` would orphan every recording,
so treat `app://` as frozen.

### Things that were fiddly, so they do not get re-broken

- **Main and preload are emitted as `.cjs`.** `electron` is a CommonJS module, so
  `import { BrowserWindow } from 'electron'` throws "does not provide an export named"
  under ESM — and this package is `"type": "module"` for the web build. Tomato Alarm
  sidesteps it by having no `type` field at all.
- **`app.setName('Interview Gacha')` runs before anything reads a path.** userData is
  derived from the app name, which is package.json `name` when unpackaged but
  `productName` once packaged. Without pinning it, dev and the built app use two
  different folders and each sees a different bank.
- **The real bank is never bundled.** `publicDir` is off for the Electron renderer,
  because Vite would otherwise copy `public/questions.seed.json` into the app and
  therefore into any dmg. The fictional bank ships explicitly via `extraResources`,
  and `files` additionally excludes `**/questions.seed.json`.
- **The icon is drawn by a script, not stored as art.** `scripts/make-icon.mjs` renders
  `build/icon.png` (1024px) and `build/icon.icns` with no dependencies — it samples the
  shapes and encodes the PNG itself, because this machine has no SVG rasteriser and one
  is not worth installing for a single icon. electron-builder picks up
  `build/icon.icns` from `buildResources`, and `setDevDockIcon()` in the main process
  loads the png in dev, since `npm run desktop` otherwise shows Electron's own atom.
  The menu bar still says "Electron" in dev — that comes from node_modules' Electron
  bundle and cannot be changed at runtime; the packaged app says Interview Gacha.
- **Never launch the packaged app from an Electron-hosted terminal.** VS Code's terminal
  and Claude Code's shell set `ELECTRON_RUN_AS_NODE=1`, which any Electron binary
  inherits: the app then runs as plain Node, prints nothing and exits 0 straight away,
  which looks exactly like a crash. `env -i HOME=$HOME PATH=/usr/bin:/bin
  "/Applications/Interview Gacha.app/Contents/MacOS/Interview Gacha"` runs it properly,
  and double-clicking in Finder was never affected.
- **Microphone:** `NSMicrophoneUsageDescription` (via `mac.extendInfo`) plus Electron's
  own `setPermissionRequestHandler`, which denies by default. `hardenedRuntime` is
  **off** and `identity` is `null`, because entitlements only apply to a signed app and
  there is no Developer ID here. `build/entitlements.mac.plist` is dormant — see the
  comment inside it, and do not try to ad-hoc sign with `codesign --deep`, which
  re-signs the nested Electron Framework and stops the app launching entirely.

### Putting your own bank in

The app reads `<userData>/questions.seed.json`, i.e.:

```
~/Library/Application Support/Interview Gacha/questions.seed.json
```

Copy it there once. Editing that file and pressing **Reload from file** in Settings
picks up changes with no rebuild. If it is absent the app falls back to the bundled
fictional bank, exactly as the web version does.

---

## Eye-contact training (optional, off by default)

Practising not letting my eyes wander off the lens. Switched on in **Settings → Eye contact**;
everything about it is opt-in and the app is complete without it.

While recording, a soft dot sits at the top centre of the window, next to the laptop's lens. It
glows while I am holding the lens and goes pale when I drift. **There is no counter on screen
during the answer on purpose** — a number ticking over just becomes the new thing to stare at. The
numbers appear after the rating, in `GazeReport`.

### The pipeline

```
camera frame → MediaPipe face mesh → four numbers → deviation from calibration → debounce → summary
   (dropped)      (478 landmarks)     landmarks.ts        gazeTracker.ts                     Session.gaze
```

The four numbers are iris position within each eye opening (x and y) and nose offset from the face
midlines (x and y). All four are divided through by eye or face size, so leaning towards the screen
does not read as a glance.

### Things that were fiddly, so they do not get re-broken

- **The camera is not mirrored, so image-right is my left.** Looking at the left of my screen makes
  `irisX` go *up*. `directionFor()` in `gazeTracker.ts` is the single place that flip is applied,
  and there is a test asserting it, because getting it backwards would send me looking for a
  distraction on the wrong side of the desk.
- **Blinks are not glances.** A closing eyelid drags the iris centre downwards and reads as a large
  look-down several times a minute. Frames below `GAZE_CONFIG.blinkEyeAspect` hold the previous
  reading instead of being believed.
- **Saccades are not glances.** Eyes flick constantly during speech. A drift only counts after
  `driftToCountMs`, and contact has to be re-established for `returnToResetMs` before another one
  can be counted. Loosening these makes the count meaningless, not more sensitive.
- **A missing face is untracked time, not a look-away.** A detection failure and looking away are
  not the same thing, and only one of them is my fault. The current hold survives a short gap.
- **`summary()` does not mutate.** It used to close the open glance by writing to its own state, so
  calling it twice appended a second, zero-length glance. Tests catch this now.
- **The model and wasm are imported with `?url`, not put in `public/`.** The Electron renderer
  builds with `publicDir: false` (so my real bank cannot end up in a dmg), and `?url` assets are
  emitted by Vite for the web build and the Electron build alike, with no extra packaging step.
  `src/vision/face_landmarker.task` is 3.6MB and committed, so the build works offline.
- **The wasm is the SIMD build only.** `FilesetResolver.forVisionTasks` would pick a nosimd
  fallback, but shipping a second 10MB binary for a case that cannot happen on this machine is not
  worth it. An old browser lands in the tracker's `unsupported` state, which says so and leaves
  recording working.
- **macOS asks for the camera lazily.** `camera:request` over IPC, called the first time the camera
  is actually wanted, rather than at launch beside the microphone prompt. Somebody who never turns
  this on is never prompted. `NSCameraUsageDescription` is in `mac.extendInfo`.
- **The dot is positioned relative to the window, not the screen.** If the window is not near the
  top of the display it will not line up with the lens. Calibration is what keeps the *measurement*
  correct regardless; the dot's position only affects how good a visual cue it is.

### Calibration

Everything is measured as a deviation from a baseline captured in Settings: me, at this desk,
looking at this lens. It works uncalibrated — `NEUTRAL_GAZE_BASELINE` assumes a centred face and
centred eyes — but two seconds of calibration is noticeably better.

The calibrator takes the **median**, not the mean, and refuses a sample set that wobbles more than
`calibrationMaxWobble`. A baseline taken mid-movement is worse than no baseline at all, because
every session afterwards is measured from it.

## Code conventions

- Write clear comments. I read and edit this code myself. Comments in English.
- Every tunable number (draw weights, point multipliers, pity counter, pet growth thresholds) goes in a config object at the top of its file. Do not scatter magic numbers through the logic. Game balance lives in `src/game/config.ts`.
- Model the four-stage answering flow as a state machine. Do not assemble it from a pile of booleans.
- Use `useLiveQuery` from dexie-react-hooks for reactivity. Do not hand-roll subscriptions.
- Keep components small. Over 300 lines in one file means it should be split.
- Components never write to Dexie directly. Every write goes through `src/db/actions.ts`.

---

## Visual tone

Cute, soft, tactile. It should feel like a physical toy, not a productivity tool.

- Background cream `#FDFBF7`, text warm black `#3D3A36` (never pure black)
- behavioural warm pink `#FFB5A7`, tech mint green `#A8E6CF`, accent peach `#FF9A76`
- SSR effects: gold `#FFD93D` plus a rainbow gradient
- Large radii (16–24px), soft shadows (wide blur, low opacity)
- Respect `prefers-reduced-motion`, and add a "reduced motion" toggle in settings
- Use a rounded sans-serif typeface — question text should feel friendly, not clinical
- Question text must be large. I read it standing up before answering out loud.
- Never: sharp-cornered cards, corporate blue, dense tables, red warning styling of any kind

Every colour is a token in `src/index.css` under `@theme`. There are no hex codes in components. The typeface is a **system** rounded stack (`ui-rounded` → SF Rounded on macOS) rather than a webfont, because loading a webfont would be a third-party request and rule 3 forbids it.

### Micro-interactions

These are what make it feel like a toy rather than a form. Conventions, so they stay consistent:

- **Anything clickable gets `.toy-press`** (defined in `src/index.css`): lift 2px and grow 2% on hover with a deeper shadow, then press down and shrink slightly on click. Large surfaces use `.toy-press-soft` as well, where a 2px lift would read as a wobble.
- It lives in CSS, not in a Tailwind class string, for one specific reason: **reduced motion has to remove the `transform` entirely.** A hover transform with transitions merely disabled would still jump, which is the opposite of what someone asking for reduced motion wants. Both the media query and the `data-reduced-motion` override null it out.
- **Page transitions** are a fade plus a 14px upward drift, via `AnimatePresence mode="wait"` in `App.tsx` so screens never overlap.
- **Empty states always get a drawn illustration** from `src/components/illustrations.tsx` — inline SVG in the palette tokens, never emoji (inconsistent across machines) and never an image file (that would be a request). `EmptyState` takes an `illustration` name, so a bare "No data" is not expressible.
- **Loading spins the pet.** `PetSpinner` is the only loading indicator in the app; there is no generic spinner. Under reduced motion it breathes instead of rotating.

One palette judgement to revisit if it bothers you: rarity R uses a pale powder blue (`--color-rarity-r: #bcd9ef`) because the four tiers needed four distinguishable tints and the spec's palette has no fourth. It is pastel rather than corporate, but it is the only blue in the app.

---

## Project status

<!-- Tick these off as phases complete, so a fresh session knows where things stand. -->

- [x] Phase 1 — Project skeleton + data layer
- [x] Phase 2 — Draw logic
- [x] Phase 3 — Answering flow (four-stage state machine)
- [x] Phase 4 — Gacha machine + wheel animations
- [x] Phase 5 — Reward system (pet / collection / badges)
- [~] Phase 6 — History, stats, question management, settings
- [x] Phase 7 — Visual polish
- [x] Phase 8 — Eye-contact training (optional camera, counts glances, stores no video)

Phase 6 is partly done: history, summary stats, settings, export/import and "reload bank from file" all exist. What is **not** built yet is in-app question editing — right now the bank is edited by hand in `public/questions.seed.json` and picked up with the "Reload from file" button in Settings.

Phase 4 covers the capsule drop / wobble / crack-open sequence. There is no spinning wheel yet.

---

## Key file locations

<!-- Add to this as the project grows, so later sessions don't have to rediscover it. -->

- `public/questions.seed.json` — seed question bank, imported on first run (gitignored)
- `public/questions.example.json` — fictional sample bank, fallback for fresh clones
- `src/types.ts` — all type definitions
- `src/game/config.ts` — **all** game balance: draw weights, point values, pity threshold, pet thresholds, badge definitions
- `src/game/flow.ts` — the state machine, `isAnswerUnlocked` (the spoiler gate), `SafeQuestion`, stage and rating copy
- `src/game/draw.ts` — weighted draw and the pity counter
- `src/game/rewards.ts` — points, streaks, pet growth, badge conditions (all pure functions)
- `src/db/db.ts` — Dexie schema
- `src/db/bank.ts` — first-run import and the seed → example fallback
- `src/db/actions.ts` — every write that advances the game
- `src/db/history.ts` — reading past sessions back out, joined to their recordings
- `src/components/HistoryRow.tsx` — one history row: playback, delete audio, edit note
- `src/test/helpers.ts` — shared test helpers, including the `reloadPage` simulation
- `src/db/transfer.ts` — JSON export and import
- `src/hooks/useRecorder.ts` — MediaRecorder wrapper, including the permission-denied path
- `src/vision/landmarks.ts` — face mesh → four numbers; no MediaPipe import, so it is testable
- `src/vision/gazeTracker.ts` — the eye-contact state machine and debounce (pure)
- `src/vision/calibration.ts` — capturing the baseline, and refusing a bad one (pure)
- `src/vision/faceLandmarker.ts` — the only file that loads MediaPipe and the model
- `src/hooks/useGazeTracker.ts` — camera lifecycle and the 10Hz sampling loop
- `src/components/GazeDot.tsx` — the "look here" dot beside the lens
- `src/components/GazeOverlay.tsx` — the hidden video element plus the dot, mounted by DrawPage
- `src/components/GazeReport.tsx` — the numbers after the reveal, plus the one-line history version
- `src/components/GazeSettings.tsx` — the Settings panel, including calibration
- `src/hooks/useAppData.ts` — all `useLiveQuery` reads
- `src/pages/DrawPage.tsx` — orchestrates the four stages
- `src/index.css` — colour tokens, fonts, radii, shadows, `.toy-press`, reduced-motion rules
- `src/components/illustrations.tsx` — inline SVG art for empty states
- `src/components/PetSpinner.tsx` — the only loading indicator in the app
- `src/components/petFace.ts` — the pet's face per stage, shared by the panel and the spinner

---

## Commands

```bash
npm run dev        # local dev server
npm run build      # production build
npm run preview    # preview the build
npm run typecheck  # types only, no build
npm test           # data-layer tests (vitest + fake-indexeddb)
```

Tests run against `fake-indexeddb`, a real IndexedDB implementation, rather than a
hand-written mock — a mock would happily "store" a Blob that a browser rejects. A page
reload is simulated with `db.close()` then `db.open()`, which is what makes a
persistence bug distinguishable from a read-path bug.

## Reading data back out

Anything that displays a recording must go through `src/db/history.ts`. Two rules learned
the hard way:

0. **Deleting audio deletes only audio.** `deleteRecordingForSession` removes the recording
   row and nothing else. Points are not retracted (rule 7), the reference answer stays
   unlocked (`isAnswerUnlocked` reads `durationSec` off the *session*, not the recording),
   and the rating, note and every statistic survive — the practice happened whether or not
   the file is still on disk. Notes stay editable forever, and a blank note clears the field
   rather than storing an empty string.
1. **Building a list must never load audio Blobs.** `loadHistoryEntries` uses the
   `sessionId` index via `.keys()` to find out *whether* audio exists, and
   `loadRecordingForSession` fetches the Blob only when something is about to play it.
   Joining Blobs into the list would hold every recording in memory at once.
2. **Object URLs must be keyed on the recording's numeric id, never on the record
   object.** `useLiveQuery` returns a fresh object identity on every re-run, so an effect
   depending on the object revokes the URL a playing `<audio>` element is still using.
   See the comment on `useRecordingUrl` in `src/hooks/useAppData.ts`.
