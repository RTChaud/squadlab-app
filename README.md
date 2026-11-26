# SquadLab

Personal Football Manager companion. Static site with no build step or backend, hosted on GitHub Pages.

## Setup
1. Create a repository named `squadlab` and upload all files, keeping the folder structure.
2. Add your logo as `icons/logo.png`.
3. Go to Settings → Pages → Source: *Deploy from a branch* → `main` / `(root)` → Save.
4. Open `https://USERNAME.github.io/squadlab/`. On iPhone, use Share → Add to Home Screen.

Imported extracts are stored only in this browser's IndexedDB. They are never uploaded. The one exception is **AI Analysis**, on Comparison and on the player page: tapping it sends that comparison, or that player with his positions, roles, lineup places and the relevant club players, to the SquadLab Worker, which forwards it to the AI provider. On the player page, the club's own players get a Development Report and anyone else a Recruitment Report. The Worker asks for its access code once per device; the code stays in that browser and isn't part of app backups. **Copy for ChatGPT** sends nothing: it only puts the comparison or player on your clipboard.

## Home

Nine tiles: Squad · Lineups · Tactic, Shortlists · Tags · Comparison, Development · Snapshots · Data. Above them, the club banner shows the crest, club name and in-game date; the date opens Snapshots.

**My Club** (tap the club banner): a dashboard for the active career, driven by one squad selector (All club players, First Team, Reserves, Youth, Out on loan; club players only, one per player ID). It shows:
- **Header:** crest, club, in-game date and *Manager since* with time in charge, from the earliest in-game date recorded for the career. This date is stored per career (`careerMeta:<careerId>`), only moves earlier, survives snapshot deletion and is part of app backups.
- **Squad statistics:** CA, PA and headroom (PA − CA), monthly salary and age, with record holders and ties.
- **Development:** periods shared with Development; actual dates are shown, and shorter history is labelled. The cohort is the squad's current members, compared only where they were at the club with a CA at both dates.
- **Distributions:** age, CA, PA and salary bands, each tappable.
- **Squad evolution:** across snapshots, using each date's own squad.
- **Other sections:** nationalities (every nationality a player holds; nations with one player grouped as Others), contract outlook (cumulative 6/12/24-month windows), wage concentration, position coverage on the pitch (familiarity 16+, also the default in filters), and snapshot changes (Transfers in / Transfers out with the month first recorded; squad moves are listed separately).

Salaries are monthly, from the weekly wage of a contract with your club. A player on loan at your club keeps his parent club's contract, so his salary counts as unknown. Missing values are left out and counted, never treated as 0.

**Club crest and colours** (`data/clubs.json`): one entry per club, keyed by the club's FM `unique_id` (the extract's `club.unique_id`; the club name is used as a fallback match):

```json
{ "clubs": { "865": { "name": "Olympique Lyonnais", "colours": ["#da1f26", "#1b3f94"], "crest": "icons/crests/865.png" } } }
```

- `colours`: one or two hex colours, used as faint accents in the banner (one colour is used for both). Leave it out for neutral accents.
- `crest`: path to an image in the repo (a transparent PNG or SVG works best), or `null`. Without a crest, or if the file can't be loaded, the SquadLab logo is shown.

- **Development**: the latest snapshot's club players (out on loan included, shortlist-only players excluded) ranked by CA gained, for Overall, 12 months, 3 months or 1 month, and All squads, First team, Reserves, Youth or Out on loan. The end date is the latest snapshot. Overall starts at the player's first snapshot as a club player in his current spell; a time window starts at his last observation on or before the cutoff, or at his first club snapshot (Since joining) or the career's first snapshot (Shorter coverage). Fewer than two observations with CA shows Not enough history. A row opens the player's development graph.
- **Snapshots**: the career's snapshots by in-game season (July–June), newest first, with club player counts, Latest and Pinned markers and the stored snapshot data size (an estimate). View a snapshot read-only, compare two dates (joined, left, biggest CA gains, by club membership and player identity), pin milestones, and delete snapshots one at a time or several together. The latest snapshot cannot be deleted, pinned snapshots must be unpinned first, and tags and lineups are never touched.

## Data
The **Data** tile on Home opens:
- **Add FM snapshot**: adds a later in-game date (the file's game_date) to the active career, after showing the destination career and the incoming date. The same date offers to replace only that snapshot. An earlier date is refused here. Players are matched by FM unique_id, with uid as a fallback only when unambiguous, so tags, lineups and history stay linked even when the exporter's career_id differs. A different career_id never creates, switches or overwrites a career.
- **Restore older snapshot**: adds an earlier in-game date to the active career; the newest snapshot stays selected.
- **Start new career**: starts a separate career from a snapshot; existing careers stay on this device. **Switch career** appears when there is more than one.
- **Import app backup**: restores a SquadLab backup and replaces the current data, after you confirm.
- **Export app backup**: saves one JSON file containing every snapshot and setting. On iPhone, use Save to Files.
- **Reset app data**: clears every career stored on this device.

One career is active at a time, and backups cover the active career. Restoring a backup replaces every career on the device. If your browser data is cleared, the export is your only copy, so keep backups in iCloud Drive.

To test locally, run `python3 -m http.server` in the folder and open `http://localhost:8000/`. ES modules won't load if you open the file directly with `file://`.

## Individual training configuration
The Development screen recommends up to five individual training focuses for the selected position and roles. Every focus comes from `data/individual_training.json`; no focus is named in the code.

- `schema_version` is the file format (the app supports 1). `data_version` names the mapping revision: change it whenever focuses or attributes change.
- Each entry in `training_focuses` has a stable `id`, a display `label`, `applies_to` (`all`, `outfield` or `goalkeeper`) and `trained_attributes` (attribute ids such as `first_touch`, `jumping_reach`, `work_rate`).
- `provisional`, `notes`, `sources` and any other extra fields are ignored by the calculation.
- Adding, removing, renaming (same `id`), reordering, or changing a focus's attributes or `applies_to` needs no code change.
- An attribute id the app doesn't record, an unknown `applies_to` or a duplicate `id` leaves that focus out. When testing locally, each problem is listed under the recommendations and logged in the browser console as "[SquadLab training] …". If an id needs translating to the app's name, add it to `CANONICAL_ATTRIBUTE_ALIASES` in `js/data/training.js`.

To replace it:
1. Keep the file name `individual_training.json` and the same structure, and update `data_version`.
2. Optional: run `python3 -m http.server`, open a player's Development screen at `http://localhost:8000/` and check that no issue list appears under the recommendations.
3. Upload it to `data/` in the repository, replacing the old file. GitHub Pages redeploys automatically; reopen the app.

## Structure
```
index.html, manifest.webmanifest
data/fm-nation-mapping.json   nation ID → name map from the save (replace when regenerated)
data/role-catalogue.json  role catalogue (from "Roles and positions"): roles per position and phase, each with its key attributes
data/individual_training.json  individual training focuses (id, label, applies_to, trained attributes) for the Development screen's recommendations
css/styles.css
icons/logo.png
js/app.js              shell, import flow, view dispatch
js/router.js           hash routes
js/store.js            active career, snapshot history and timeline checks, career switching, backup/restore/reset
js/data/db.js          IndexedDB (snapshots, snapshotIndex, settings, metrics; upgrades keep data)
js/data/importer.js    snapshot + backup parsing and validation
js/data/snapshot.js    model building (incl. the deduplicated pool behind Shortlists → All), team_slot squad linking, player summary values
js/data/positions.js   FM-style position formatting
js/data/attributes.js  attribute groups/labels, colour bands, value direction, traits
js/data/attributeInfo.js  short attribute explanations + source (SI FM24 manual), bundled offline
js/data/changes.js     "Show changes" preferences and change colouring rules
js/data/players.js     persistent player identity (player_key), metrics (incl. club membership and squad per snapshot), history
js/data/clubIdentity.js Home banner crest and colours from data/clubs.json
js/data/clubDashboard.js My Club calculations (statistics, development, distributions, evolution, contracts, wages, positions, changes)
js/data/development.js Development ranking rules, season grouping, snapshot comparison
js/data/nations.js     reads data/fm-nation-mapping.json to show nationalities
js/data/flags.js       nation → flag emoji
js/data/tags.js        player tags (app data, kept in backups)
js/data/lineups.js     4-2-3-1 slot definitions, default/custom lineups, Squad slot ranks, saved role pair per slot (shared by First / Backup / Future XI)
js/data/radar.js       radar overviews, selectable attributes, radar preferences
js/data/roles.js       role catalogue loading/validation, position + attribute mapping, role score (equal-weight mean of the role's key attributes, 1–20; unavailable if one is missing), saved-role resolution
js/data/training.js    individual training: loads and validates data/individual_training.json, maps its attribute ids to the app's (one adapter), ranks focuses for the selected roles
js/data/listView.js    Squad/Shortlists columns, filters (incl. Tactic → filters), sorting, change columns, role attribute columns (View), saved views
js/data/money.js       GBP formatting (two decimals, display rounded up: next £1,000 below £1m, next £100,000 from £1m), weekly → monthly salary, typed amounts
js/data/contract.js    Contract data shared by the Contract sheet, table columns and filters: expiry, salary, value, clauses (FM26 codes 0, 27, 1 and 55 read only in the tested FM26 format)
js/data/comparisonRequest.js  AI Analysis: builds the structured comparison (players, position/roles, fees, benchmarks) sent to the Worker
js/data/aiClient.js    AI Analysis: Worker URL, the /compare call, response checks, report wording
js/data/chatPrompt.js  Copy for ChatGPT: the comparison or player (and its report) as one plain-text prompt, built locally
js/data/playerRequest.js  AI Analysis on the player page: Development / Recruitment Report data (positions, roles, lineup jobs and slot roles, history, club alternatives)
js/ui/dom.js           DOM helper + icons
js/ui/dataMenu.js      Data menu and import/export/reset flows
js/ui/components/      playerList.js, feedback.js, sheet.js, backupExport.js, devChart.js, metricPicker.js, tagSheet.js, promptSheet.js, radarChart.js, radarSection.js,
                       playerBrowser.js, playerTable.js, filterSheet.js, viewSheet.js, attributePicker.js, familiarityPitch.js,
                       attributeInfoSheet.js, playerPicker.js, radarAttributePicker.js, roleExplorer.js, contractSheet.js, trainingSection.js,
                       aiAnalysis.js (AI Analysis + Copy for ChatGPT buttons, report sheet), playerReport.js (Development / Recruitment Report views)
js/ui/views/           home.js, squad.js, shortlists.js, tags.js, player.js, development.js (one player's graph + individual training), devBoard.js (Development ranking), club.js (My Club), snapshots.js (timeline, view, compare), lineups.js, lineup.js (pitch + slot roles), lineupPicker.js, compare.js, tactic.js (position + roles → Find matching players)
worker/worker.js       Cloudflare Worker (paste into the dashboard's Edit code): POST /compare with access code, rate limit, fixed analyst instructions, report checks
```
