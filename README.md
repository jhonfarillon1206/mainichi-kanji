# Kanji Deck

Personal kanji flashcards with custom decks and spaced repetition (FSRS, the algorithm Anki uses by default). Everything is stored in your browser; there is no backend.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
npm run preview    # serve the build
```

## Deploy (free)

**Netlify:** drag the `dist/` folder onto https://app.netlify.com/drop.
**GitHub Pages:** push the repo, build, and publish `dist/` (the app uses hash routing and relative paths, so no extra config is needed).

After deploying, open it on your phone and use "Add to Home Screen". It works offline.

## Structure

```
src/
  lib/db.js       Dexie schema, settings, card factory, import/export
  lib/srs.js      FSRS scheduling, study queue, card status, day boundary
  lib/stats.js    Dashboard numbers, all derived from the review log
  views/Dashboard.vue  Today, decks, activity, leeches
  views/Deck.vue       Add/edit/import/search cards in a deck
  views/Study.vue      Flashcards (Space = reveal, 1–4 = grade)
  views/Settings.vue   Settings, backup/restore, sample deck
  components/Modal.vue        Reusable pop-up
  components/CardModal.vue    Add/edit cards, paste a list
  components/NewDeckModal.vue Create a deck
  components/Overlay.vue      Toasts and confirm dialogs
  lib/ui.js                   toast() and ask() helpers
```

## How status works

- **New**: never studied
- **Learning**: studied, interval under 21 days
- **Due**: next review date has passed
- **Mastered**: interval 21+ days (changeable in Settings)
- **Leech**: forgotten 4+ times (changeable in Settings)

## Backups

Data lives in IndexedDB in one browser. Use **Settings → Export backup** regularly; clearing site data deletes everything.
