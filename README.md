# SquadLab

Personal Football Manager companion. Static site with no build step or backend, hosted on GitHub Pages.

## Setup
1. Create a repository named `squadlab` and upload all files, keeping the folder structure.
2. Add your logo as `icons/logo.png`.
3. Go to Settings → Pages → Source: *Deploy from a branch* → `main` / `(root)` → Save.
4. Open `https://USERNAME.github.io/squadlab/`. On iPhone, use Share → Add to Home Screen.

Imported extracts are stored only in this browser's IndexedDB. They are never uploaded.

To test locally, run `python3 -m http.server` in the folder and open `http://localhost:8000/`. ES modules won't load if you open the file directly with `file://`.

## Structure
```
index.html, manifest.webmanifest
css/styles.css
icons/logo.png
js/app.js              shell, import flow, view dispatch
js/router.js           hash routes (add profile/compare/history/XI routes here)
js/store.js            active snapshot + per-career settings
js/data/db.js          IndexedDB (snapshots + settings)
js/data/importer.js    JSON parsing + validation
js/data/snapshot.js    model building, player summary values
js/data/positions.js   FM-style position formatting
js/ui/dom.js           DOM helper + icons
js/ui/components/      playerList.js, feedback.js
js/ui/views/           home.js, squad.js, shortlists.js
```
