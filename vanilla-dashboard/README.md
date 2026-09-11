# CAIDF Visualization System (Vanilla Dashboard)

This project is a browser-only clinical visualization dashboard (no build step required) for exploring multi-disciplinary patient evidence over time.

It is designed for quick sharing, fast local testing, and easy customization by non-frontend-specialist collaborators.

---

## Technological Restrictions and Secure Environment Compliance
During development, the project was subject to software restrictions associated with the secure computing environment used for CAIDF-related work. Although early versions of the visualization workflow considered or relied on Node.js-based tooling, the support team raised security concerns about installing Node.js because it can be used for server-side execution and code that interacts beyond the local environment. The project team was advised to use tools already supported on the secure computing environment, such as Visual Studio Code, JavaScript development tools, Python, and Conda, and to avoid Node.js unless it became strictly necessary. As a result, several weeks of development effort were spent adapting and porting the earlier codebase into a more restricted, compliant form that could run as a static browser-based JavaScript application without requiring a Node.js runtime, backend server, package manager workflow, or external service execution. This restriction directly influenced the current architecture of the COMPASS prototype: the dashboard is  implemented primarily with static HTML, CSS, and JavaScript, loads approved local data files through a static HTTP server, and avoids server-side computation in the current runtime. This design choice should be preserved unless future maintainers receive explicit approval to reintroduce Node.js or other backend tooling within the secure environment.

---

## TL;DR for New Contributors

1. Start a static server from this folder (do **not** use `file://`).
2. Open `http://localhost:8000`.
3. Main files:
   - `index.html` (layout and section labels)
   - `script.js` (all logic/data parsing/rendering)
   - `styles.css` (all styling/responsive behavior)
4. Patient data lives in `data/`.
5. If Patient 2 looks sparse, check `data/Patient_12738_OP/notes_manifest.json` first.
6. Data for the Q/A is LLM_Questions.json

---

## Project Goals

- Provide a compact view of patient care trajectory across phases.
- Show event evidence by discipline and category.
- Support comparison of timeline visual styles (pointillism vs storyline).
- Keep everything runnable without Node/npm tooling.

---

## Current Dashboard Sections

- **Patient Information** (left sidebar)
- **Episode Summary**
- **Filters**
- **Parallel Clinical Event Timeline**
  - `Pointillism (Ribbons)`
  - `Storyline (Lanes)`
  - `Patient Progress Timeline`
- **Clinical Evidence Summary** (renamed from “Discharge Readiness”)
  - `All Patient Summary`
  - `Progress Score Card`
  - `Clinical Checklist` (renamed from “Readiness Checklist”)
  - `Team Activity Heatmap`
  - `Trend Sparklines`
- **Questions**

### Phase Naming (important)

Displayed phase names are:

- `Preadmission` (renamed from `Home`)
- `ER`
- `Unit`
- `Discharge`
- `Post-Discharge` (renamed from `BackHome`)

---

## Repository Layout (important files)

```text
vanilla-dashboard/
├── index.html                  # Page structure, titles, selectors
├── script.js                   # Data loading, parsing, rendering, interactions
├── styles.css                  # Global styles + responsive rules
├── package.json                # Minimal metadata only; not required to run the dashboard
├── data/
│   ├── Patient1.txt            # Summary narrative source for patient 1
│   ├── Patient2.txt            # Summary narrative source for patient 2
|   ├── Patient1summary.json    # 24 summary for patient 1
|   ├── Patient2summary.json    # 24 summary for patient 2
|   ├── LLM_Questions.json      # Q/A panel
│   ├── UIC_Falls__10707/       # Patient 1 detailed note extracts + manifest
│   ├── UIC_Falls__10707.zip    # Optional: ZIP fallback if present (many checkouts use folder only)
│   └── Patient_12738_OP/       # Patient 2 detailed note extracts + manifest
│       ├── notes_manifest.json
│       ├── SpanTrex_OP/
│       └── GraphTrex_OP/
├── test_graph/                 # Python/JS experimental scripts, exports, prototypes
└── README.md
```

Normal operation uses the `data/<patient>/` folders plus `notes_manifest.json`. The `.zip` paths in code are optional archives if you add them.

---

## Data Model and Loading Behavior

### High-level flow

1. `loadPatientData(patientNum)` loads `data/Patient${patientNum}.txt`.
2. `generateClinicalEventsData(patientNum, rawText)` extracts summary events.
3. Detailed events are loaded from patient-specific source:
   - Patient 1: `data/UIC_Falls__10707.zip` (folder-first, zip-fallback)
   - Patient 2: `data/Patient_12738_OP.zip` (mapped to folder `data/Patient_12738_OP/`)
4. `loadZipNotes(zipUrl)` first tries folder mode via `loadFolderNotes(folderPath)`.
5. Folder mode requires `notes_manifest.json`.
6. Note-level events are merged with summary events for timeline/evidence visuals.

In typical checkouts, **folders + manifests are enough**; the `.zip` URLs in `script.js` are only needed if you rely on the ZIP fallback instead of (or in addition to) the extracted folders.

### `notes_manifest.json` format

Each entry should look like:

```json
{
  "path": "data/Patient_12738_OP/SpanTrex_OP/SpanT_note_1.json",
  "lane": "MD",
  "date": "2023-05-04"
}
```

Required fields:

- `path`: relative fetch path to SpanTrex JSON
- `lane`: one of `MD`, `RN`, `PT`, `OT`, `SLP`, `SW`
- `date`: ISO date (`YYYY-MM-DD`)

If manifest is missing/unreadable, detailed notes are skipped and the app falls back to summary events only.

---

## How to Run

### Recommended: Python static server

```bash
cd vanilla-dashboard
python3 -m http.server 8000
```

On Windows, if `python3` is not on your PATH, use:

```bash
python -m http.server 8000
```

Open: [http://localhost:8000](http://localhost:8000)

### Alternatives

- VS Code Live Server
- `npx http-server -p 8000`

> Avoid opening `index.html` directly with `file://` because fetch/CORS restrictions can block data loading.

### Cache busting for `script.js`

`index.html` loads the app as `script.js?v=…` (query string). If the browser shows stale behavior after you edit `script.js`, **bump that version number** in `index.html` or do a hard refresh (Ctrl+Shift+R / empty cache).

---

## Typical Editing Workflow

### UI text or labels

- `index.html` for section titles and dropdown labels.
- Some labels are generated in `script.js` (search by visible text).

### Chart logic

- `script.js` contains all render functions.
- Useful anchors:
  - timeline rendering (`renderClinicalTimeline`, `drawTimelineLegend`)
  - evidence trend (`renderEvidenceTrend`)
  - summary matrix modes (`renderReadinessMatrix` and sub-renderers)

### Styling/responsiveness

- `styles.css`.
- Recent changes include responsive legend scaling using `clamp(...)` and container-aware sizing.

---

## Panel Code Map (Detailed)

This section maps each visible dashboard panel to the exact files/functions that render it, so you can quickly find where to edit behavior, layout, and styles.

### 1) Patient Information panel

- **HTML container**: `index.html` -> `#patient-info-container`
- **Render function**: `script.js` -> `renderPatientInfoSidebar()`
- **Called from**: `showDashboard()` after patient data loads
- **Primary data source**: `patientData.basic` from `loadPatientData()`
- **Related styles**: `styles.css` -> `#patient-info-section`, `.patient-info-container`, `.patient-info-row`, `.patient-info-label`, `.patient-info-value`

### 2) Episode Summary panel

- **HTML container**: `index.html` -> `#episode-summary-container`
- **Render function**: `script.js` -> `renderEpisodeSummary()`
- **Called from**: `showDashboard()`
- **Primary data source**: `clinicalEventsData.events` (phase/team counts) + `patientData.basic` (admit/discharge dates)
- **Related styles**: `styles.css` -> `#episode-summary-section`, `.episode-summary-container`, `.episode-summary-item`, `.discipline-tags`, `.discipline-tag.*`

### 3) Filters panel

- **HTML container**: `index.html` -> `#filters-container`
- **Render function**: `script.js` -> `renderFilters()`
- **Apply handler**: `script.js` -> `applyFilters()`
- **Global filter state**: `script.js` -> `currentFilters` (phase, discipline, category checkboxes, **collaboration-only** via `#filter-collaboration` / `collaborationOnly`)
- **Related styles**: `styles.css` -> `.filters-container`, `.filter-group`, `.filter-row`, `.filter-checkbox-item`, `.filter-color-dot`

### 4) Parallel Clinical Event Timeline panel

- **HTML container**: `index.html` -> `#clinical-timeline-container`
- **Mode selector**: `index.html` -> `#timeline-mode-select`
- **Main dispatcher**: `script.js` -> `renderClinicalTimeline()`
- **Mode handlers**:
  - `renderStorylineTimeline(container, filteredEvents)` — Storyline (Lanes)
  - `renderPointillismTimeline(container, filteredEvents)` — Pointillism (Ribbons); also handles **Patient Progress Timeline** when `currentTimelineMode === 'patient_progress_timeline'` (see `renderClinicalTimeline` switch and branches inside this path)
- **Phase/discipline constants**:
  - `TIMELINE_PHASES`
  - `TIMELINE_LANES`
  - `DISCIPLINE_COLORS` (single source of discipline colors across panels)
- **Tooltip/popup interactions**:
  - `showEventTooltip()`, `hideEventTooltip()`
  - `showEventDetails()`, `closeEventPopup()`
- **Related styles**: `styles.css` -> `.timeline-section`, `.clinical-timeline-container`, `.timeline-mode-select`, tooltip/popup classes

### 5) Clinical Evidence Summary panel (bottom-left)

- **UI title in `index.html`**: “Clinical Evidence Summary” (same role as the _Care Transition Summary_ panel in the COMPASS project report).
- **HTML container**: `index.html` -> `#readiness-matrix-container`
- **Mode selector**: `index.html` -> `#matrix-mode-select`
- **Main dispatcher**: `script.js` -> `renderReadinessMatrix()`
- **Subview handlers**:
  - `renderAllPatientSummary(container)` — All Patient Summary (default view)
  - `renderProgressScoreCard(container)`
  - `renderReadinessChecklist(container)` (UI label may be renamed in HTML)
  - `renderTeamActivityHeatmap(container)`
  - `renderTrendSparklines(container)`
- **All Patient Summary sub-elements**:
  - **Dropdown**: `index.html` -> `#matrix-mode-select` option `value="all_patient_summary"` (currently set as `selected`); change handler `script.js` -> `changeMatrixMode()`
  - **Date buttons**: rendered inside `#all-patient-summary-buttons`; each button has class `.summary-date-button`, active state `.summary-date-button--active`; click calls `updateSelectedDate(item)` (inner function inside `renderAllPatientSummary`)
  - **Key clinical issues / status**: rendered into `#all-patient-summary-detail` as `.all-patient-summary-section`; data from `item.keyClinicalIssues` (JSON field `"key clinical issues"`)
- **Data loader**: `script.js` -> `fetchPatientSummaryData(patientNum)` — fetches `data/Patient${patientNum}summary.json`
- **State variables**: `script.js` -> `allPatientSummaryDataCache`, `allPatientSummarySelectedDate`
- **Related styles**:
  - `styles.css` -> `.readiness-matrix-container`
  - `.scorecard-*`, `.checklist-*`, `.heatmap-*`, `.sparklines-*`
  - `.all-patient-summary-shell`, `.all-patient-summary-buttons`, `.summary-date-button`, `.summary-date-button--active`, `.all-patient-summary-detail`, `.all-patient-summary-section`, `.all-patient-summary-section-title`, `.all-patient-summary-list`

### 6) Daily Clinical Evidence Trend panel (bottom-right; currently commented out, not present in the interface)

- **HTML container**: `index.html` -> `#evidence-trend-container`
- **Render function**: `script.js` -> `renderEvidenceTrend()`
- **Chart type**: D3 stacked bar chart by day
- **Category colors**: `script.js` -> `EVIDENCE_PANEL_COLORS`
- **Legend overlay**: generated in `renderEvidenceTrend()` as `.trend-legend-overlay`
- **Related styles**: `styles.css` -> `.trend-section`, `.evidence-trend-container`, `.trend-legend-overlay`, `.trend-legend-item`, `.trend-legend-color`

### 7) Questions panel (bottom-right)

- **HTML container**: `index.html` -> `#questions-container`
- **Mode selector**: `index.html` -> `#trend-view-select` -> only option is `value="questions"` (set as `selected`); change handler `script.js` -> `changeTrendView()`
- **Render function**: `script.js` -> `renderQuestionsPanel()`
- **Called from**: `showDashboard()` on initial load; also `changeTrendView()` when mode is `questions`
- **Data loader**: inside `renderQuestionsPanel()` — fetches `data/LLM_Questions.json` (falls back to `data/questionData.json`)
- **Sub-elements**:
  - **Choose Profession dropdown**: `#question-profession-select`, class `.question-select`; options built dynamically from JSON; `onchange` calls `renderQuestionsAndAnswers()` (inner function inside `renderQuestionsPanel`)
  - **Date slider**: `#question-date-slider`, class `.question-date-slider`; `oninput`/`onchange` calls `handleDateChange()` (inner function); active date label gets class `.question-date-label--active`; clicking a label also moves the slider
  - **Question & answer output**: `#question-answer-output`, class `.question-answer-output`; rendered by `renderQuestionsAndAnswers()` (inner function); uses `findQuestionsWithFallback()` to walk back to nearest previous date with data; each pair uses `.qa-item`, `.qa-question`, `.qa-answer`
  - **Question status circle (new)**: each question line now includes a red/yellow/green circle at the end (`.qa-status-dot`) with tone classes `.qa-status-dot--red`, `.qa-status-dot--yellow`, `.qa-status-dot--green`
  - **Status mapping logic**: in `renderQuestionsPanel()` helper `getQuestionStatusMeta(qa, sourceDate)` in `script.js`; uses question text + dated progression to infer acute risk (red), monitoring/progressing (yellow), or improving/readiness (green), aligned with the Patient Progress Timeline R/Y/G intent
- **Primary data source**: `data/LLM_Questions.json` — array of profession objects, each with a `notes` array; each note has `date`, `note` id, and `questions` array of `{ question, answer }` objects
- **Related styles**: `styles.css` -> `.questions-container`, `.questions-panel`, `.questions-row`, `.question-select`, `.question-date-slider`, `.question-date-labels`, `.question-date-label`, `.question-date-label--active`, `.question-answer-output`, `.qa-item`, `.qa-question`, `.qa-answer`, `.qa-status-dot`, `.qa-status-dot--red`, `.qa-status-dot--yellow`, `.qa-status-dot--green`

### 8) Data loading + event generation pipeline (used by multiple panels)

- **Patient file loading**: `script.js` -> `loadPatientData(patientNum)`
- **Clinical event generation**: `script.js` -> `generateClinicalEventsData(patientNum, rawText)`
- **Raw note loaders**:
  - `loadFolderNotes(folderPath)` (manifest/folder-first)
  - `loadZipNotes(zipUrl)` (ZIP fallback)
- **Text extraction/parsing helpers**:
  - `extractClinicalEventsFromText()`
  - `updatePhaseFromLine()`
  - `extractDisciplinesToLanes()`
  - `parseDateFromText()`, `phaseToDates()`
- **Note-to-event linkage**:
  - `attachOriginNotesToEvents()`
  - `buildTimelineEventsFromNotes()`
  - `mapDateToPhase()`

### 9) Page lifecycle entry points

- **Welcome -> patient dashboard**: `handleSelectPatient()` -> `showDashboard()`
- **Back navigation**: `handleBackToWelcome()`
- **Patient selection wiring**: in `index.html` bottom script (`DOMContentLoaded` handlers)

### Quick edit guide

- **Change panel text labels/titles** -> mostly `index.html`
- **Change panel behavior/calculation** -> `script.js` render function for that panel
- **Change panel look/spacing/scroll** -> `styles.css` classes for that panel
- **Change discipline color globally** -> `script.js` `DISCIPLINE_COLORS` (+ tag classes in `styles.css` if needed)

---

## Known Important Decisions (current behavior)

- Default timeline mode is `pointillism`.
- Timeline and evidence trend include `Post-Discharge` phase name.
- Evidence trend legend (top-right) is responsive for larger displays.
- Timeline disciplines legend is also responsive (scaled by chart width).
- Patient 2 detailed data is configured to use `data/Patient_12738_OP/` (no cross-patient fallback).

---

## Troubleshooting

### “Patient 2 has very little data”

Check:

1. `data/Patient_12738_OP/notes_manifest.json` exists.
2. Paths in manifest are valid and reachable.
3. Dates are valid ISO dates and align with patient stay.
4. Browser console warnings from `loadFolderNotes`.

### “Charts render but look empty/incomplete”

- Verify server mode (`http://localhost`, not `file://`).
- Verify data files exist and fetches return `200`.
- Check console for JSON parse errors.

### “Legend/text too small on large monitors”

- Adjust responsive sizes in `styles.css` (`clamp`) and legend scaling in `drawTimelineLegend` in `script.js`.

---

## What `test_graph/` Is For

`test_graph/` contains prototypes, Python extractors, and export utilities used during development (including DOCX/ZIP extraction experiments and Excel export scripts).  
The production dashboard path is still `index.html` + `script.js` + `styles.css`.

If you hand this project to someone new, clarify whether they need:

- only the browser dashboard, or
- the data extraction/export scripts in `test_graph/` as well.

---

## Handoff Checklist (for transfer)

- [ ] Share this full `vanilla-dashboard` folder, including `data/`.
- [ ] Confirm `notes_manifest.json` files are present for detailed note folders.
- [ ] Confirm `Patient1.txt` and `Patient2.txt` contain expected dates/content.
- [ ] Include any generated exports from `test_graph/` if needed.
- [ ] Tell recipient to run local static server and test both patient buttons.

---

## Tech Stack

- HTML + CSS + Vanilla JavaScript
- D3.js v7 (CDN)
- JSZip (CDN) for zip fallback loading
- No build system; **`npm install` is not required** to run the dashboard (`package.json` is optional metadata only)

---

## Contact Notes for Future Maintainers

When making label/phase terminology updates, search both:

- user-facing HTML text in `index.html`
- programmatic labels/constants in `script.js`

---

## Deploying the Website with Vercel
This website can be deployed using [Vercel](https://vercel.com/) directly from a GitHub repository.

### 1. Fork the Repository

First, fork the `frank-2026-vcbm` repository on GitHub.
Click the **Fork** button on GitHub to create a copy of the repository under your own GitHub account.

### 2. Create a Vercel Account

Go to [Vercel](https://vercel.com/) and sign up for an account.
It is recommended to sign up using the same GitHub account where you forked the repository.

### 3. Import the GitHub Repository into Vercel

After signing in to Vercel:

1. Click **Add New Project**.
2. Select **Import Git Repository**.
3. Choose your forked `frank-2026-vcbm` repository.
4. Click **Import**.

### 4. Configure the Project

If the website files are inside a folder rather than directly in the root of the repository, set the **Root Directory** to the folder that contains `index.html`.

For example, if the repository structure is:
```text

    frank-2026-vcbm/
      website/
        index.html
        style.css
        script.js
```

then set the **Root Directory** to: **website**

Use the following deployment settings:
```text
    Framework Preset: Other
    Build Command: Leave empty
    Output Directory: ./
    Install Command: Leave empty
```

### 5. Deploy

Click **Deploy**.
Vercel will build and deploy the website. After deployment is complete, Vercel will provide a live website URL.

### 6. Updating the Website

After the project is connected to Vercel, any future changes pushed to the connected GitHub repository and branch will automatically trigger a new deployment.

Typical update workflow:
```text
    git add .
    git commit -m "Update website"
    git push
```
Once the changes are pushed, Vercel will automatically redeploy the website.

### 7. Keeping a Fork Updated

If the website is deployed from a forked repository, make sure the fork is updated whenever changes are made in the original repository.
To update the fork from GitHub:

1. Go to your forked repository.
2. Click **Sync fork**.
3. Click **Update branch**.

After syncing, Vercel will redeploy the latest version if the connected branch changes.

