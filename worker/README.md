# SquadLab

Personal Football Manager companion. Static site with no build step or backend, hosted on GitHub Pages.

## Setup
1. Create a repository named `squadlab` and upload all files, keeping the folder structure.
2. Add your logo as `icons/logo.png`.
3. Go to Settings → Pages → Source: *Deploy from a branch* → `main` / `(root)` → Save.
4. Open `https://USERNAME.github.io/squadlab/`. On iPhone, use Share → Add to Home Screen.

Imported extracts are stored only in this browser's IndexedDB. They are never uploaded. The one exception is **AI Analysis** on Comparison: tapping it sends the two compared players' data (and the selected position and roles) to the SquadLab Worker, which forwards it to the AI provider. The Worker asks for its access code once per device; the code stays in that browser and isn't part of app backups.

## Data
The **Data** button in the header opens:
- **Import FM snapshot**: adds a dated extract to the active career's history. The newest in-game date is always shown.
- **Import app backup**: restores a SquadLab backup and replaces the current data, after you confirm.
- **Export app backup**: saves one JSON file containing every snapshot and setting. On iPhone, use Save to Files.
- **Reset app data**: clears everything so you can start a different career.

SquadLab holds one career at a time. If your browser data is cleared, the export is your only copy, so keep backups in iCloud Drive.

To test locally, run `python3 -m http.server` in the folder and open `http://localhost:8000/`. ES modules won't load if you open the file directly with `file://`.

## Structure
```
index.html, manifest.webmanifest
data/fm-nation-mapping.json   nation ID → name map from the save (replace when regenerated)
data/fm27-role-catalogue.json provisional position/role catalogue (replace with a revised file; same format)
css/styles.css
icons/logo.png
js/app.js              shell, import flow, view dispatch
js/router.js           hash routes
js/store.js            active career, snapshot history, backup/restore/reset
js/data/db.js          IndexedDB (snapshots, snapshotIndex, settings, metrics; upgrades keep data)
js/data/importer.js    snapshot + backup parsing and validation
js/data/snapshot.js    model building (incl. the deduplicated pool behind Shortlists → All), team_slot squad linking, player summary values
js/data/positions.js   FM-style position formatting
js/data/attributes.js  attribute groups/labels, colour bands, value direction, traits
js/data/attributeInfo.js  short attribute explanations + source (SI FM24 manual), bundled offline
js/data/changes.js     "Show changes" preferences and change colouring rules
js/data/players.js     persistent player identity (player_key), metrics, history
js/data/nations.js     reads data/fm-nation-mapping.json to show nationalities
js/data/flags.js       nation → flag emoji
js/data/tags.js        player tags (app data, kept in backups)
js/data/lineups.js     4-2-3-1 slot definitions, default/custom lineups, Squad slot ranks
js/data/radar.js       radar overviews, selectable attributes, radar preferences
js/data/roles.js       role catalogue loading/validation, position + attribute mapping, Role attributes /100 score
js/data/listView.js    Squad/Shortlists columns, filters (incl. Tactic → filters), sorting, change columns, saved views
js/data/money.js       GBP formatting (two decimals, display rounded up: next £1,000 below £1m, next £100,000 from £1m), weekly → monthly salary, typed amounts
js/data/contract.js    Contract data shared by the Contract sheet, table columns and filters: expiry, salary, value, clauses (FM26 codes 0, 27, 1 and 55 read only in the tested FM26 format)
js/data/comparisonRequest.js  AI Analysis: builds the structured comparison (players, position/roles, fees, benchmarks) sent to the Worker
js/data/aiClient.js    AI Analysis: Worker URL, the /compare call, response checks
js/ui/dom.js           DOM helper + icons
js/ui/dataMenu.js      Data menu and import/export/reset flows
js/ui/components/      playerList.js, feedback.js, sheet.js, backupExport.js, devChart.js, metricPicker.js, tagSheet.js, promptSheet.js, radarChart.js, radarSection.js,
                       playerBrowser.js, playerTable.js, filterSheet.js, viewSheet.js, attributePicker.js, familiarityPitch.js,
                       attributeInfoSheet.js, playerPicker.js, radarAttributePicker.js, roleControls.js, roleExplorer.js, contractSheet.js,
                       aiAnalysis.js (AI Analysis button + report sheet)
js/ui/views/           home.js, squad.js, shortlists.js, tags.js, player.js, development.js, lineups.js, lineup.js, lineupPicker.js, compare.js, tactic.js (position + roles → Find matching players)
worker/worker.js       Cloudflare Worker (paste into the dashboard's Edit code): POST /compare with access code, rate limit, fixed analyst instructions, report checks
```
