# open_plan – Ergebnisseite (Handover)

Static prototype of the new results page, built 1:1 from the canvas design, with placeholder
data. Pick what you need and move it into the app.

Open `single.html` or `compare.html` in a browser. No build step, no libraries (only the Lato
font from Google Fonts).

| File | What |
|---|---|
| `single.html` | single scenario: Überblick, Energie, Anlagen & Kapazitäten, Kosten, Umwelt, Komponenten |
| `compare.html` | comparison: Vergleich auf einen Blick (table + trade-off), Energie, Kosten |
| `results.scss` | all styles, BEM, prefix `r-`. Variables at the top = the app's colours |
| `results.css` | compiled `results.scss`, only so the pages open without a build step |
| `results.js` | data and behaviour, plain JS (see below) |

## results.js

0. **`RESULTS_DATA`** – everything the pages show: projects, scenarios, per-scenario results for
   the comparison, and the catalogue of the single page (sections → subsections → charts/KPIs,
   with the numbers). Replace this with data from the backend.
1. **`ResultsLogic`** – view model: turns the data plus the page state (opened, hidden, selected,
   reference scenario …) into the values the templates need: chart layout, differences, best
   values, payback, scatter positions, waterfall.
2. **Templates** – one function per part of the page, returning HTML with the BEM classes of
   `results.scss`. Only data-driven values (bar widths, colours, chart coordinates) are inline styles.
3. **Runtime** – state, redraw, click handling, pinned bar, scroll spy, saving the view.

The HTML files contain the pre-rendered markup of the initial state, so the structure can be read
without running the page. On load, `results.js` draws it again and keeps it up to date.

In the app you can keep the server-side rendering (Django templates following the same markup)
and use only the behaviour, or keep the JS rendering and fill `RESULTS_DATA` from a view
(`json_script`).

## Behaviour

- **Filter bar**: scenario listbox (multi-select on the comparison), view switch (two pages =
  two links), download menu, section tabs. Once it has scrolled away, a compact copy is pinned at
  the top (`.r-pinned`; set `--r-pinned-top` to the navbar height in the app).
- **Subsections** open and close; **⋮** has "Daten als CSV" and "Ausblenden"; **+ Diagramm**
  adds hidden or optional charts back.
- **Tabelle anzeigen** under every chart (real `<table>`), **KPI definitions** (ⓘ) on hover/focus.
- **Comparison**: any column can become the reference ("Als Bezug"), best value per row marked,
  payback row, components on demand, trade-off with three axis pairs, waterfall with a target
  scenario, cumulative costs with break-even points.
- **Keyboard**: Escape closes the open menu and returns focus to its button; focus stays on the
  control after every redraw; changes are announced in a live region.
- **Saved per browser** (`localStorage["openplan.resultsPrototype"]`): notice and hint hidden,
  hidden/added charts, collapsed subsections, selected scenarios.

## Good to know

- **`main.css` in the app** forces `a { color: #1F567D !important; font-weight: 700 }` and loads
  before Bootstrap. Links styled differently here (`.r-bar__view-link`, `.r-bar__tab`,
  `.r-same__link`) need `!important` there.
- **Energy system and Sankey** are static SVGs here. In the app they are Drawflow and Plotly.
- **Fixed-size charts**: the trade-off scatter (1140 px) and the cumulative costs (1040 px) have
  fixed sizes, as in the canvas (designed for 1440 px). They scroll sideways on smaller screens.
- **Prototype note** (yellow, end of `compare.html`): remove once the comparison view is complete.
