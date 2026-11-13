/*
 * open_plan – results page prototype (single scenario + comparison), as in the canvas design.
 * Plain JS, no build step, no libraries. Used by single.html and compare.html.
 *
 *   0. PLACEHOLDER DATA – RESULTS_DATA: everything the page shows. Replace with data from the backend.
 *   1. (helpers are inside part 2)
 *   2. VIEW MODEL – ResultsLogic: turns RESULTS_DATA + the page state into the values the
 *      templates need (layout of the charts, differences, best values, scatter positions …).
 *      Taken over from the canvas prototype.
 *   3. TEMPLATES – HTML for each part of the page (BEM classes, see results.scss).
 *   4. PAGE RUNTIME – state, redraw, clicks, pinned bar, scroll spy, saving the view.
 */


/* ==========================================================================================
   0. PLACEHOLDER DATA
   ------------------------------------------------------------------------------------------
   Invented sample numbers, consistent across charts, tables and KPIs.
   ========================================================================================== */
var RESULTS_DATA = {
  projects: ['Seligenstadt – Teilgebiet 11 + Wärmeleitung', 'Seligenstadt – Altstadt', 'Musterquartier Nord'],
  scenarioNames: ['Wärmenetz – Biomasse + Wärmeleitung', 'Wärmenetz – Wärmepumpe', 'Wärmenetz – Gaskessel', 'Dezentrale Wärmepumpen'],
  letters: ['A', 'B', 'C', 'D'],

  // Results of each scenario for the comparison (same order as scenarioNames)
  //   short: name used in charts; network: has a heating network; comps: [name, size]
  //   opex: operating costs €/a (without capital costs); cost: annual costs [capital, O&M, energy] €/a
  //   mix: heat supply MWh/a [river HP, air HP, waste heat, biomass CHP, gas boiler]
  //   inv: investment M€ [river HP, air HP, waste heat, biomass CHP, gas boiler, storage, network]
  //   el / gas: electricity from the grid / natural gas MWh/a
  //   k: key figures (invest €, annual €/a, lcoh ct/kWh, co2 t/a, ren %, gas MWh/a, grid MWh/a)
  scenarios: [
    { short: 'Biomasse + Wärmeleitung', network: true,
      comps: [['Wärmenetz', ''], ['Wärmeleitung', '1,8 km'], ['Fluss-Wärmepumpe', '210 kW'], ['Industrielle Abwärme', ''], ['Biomasse-BHKW', '150 kW'], ['Luft-Wärmepumpe', '120 kW'], ['Gaskessel (Spitzenlast)', '']],
      opex: 242000, cost: [170000, 72000, 170000], mix: [545, 145, 320, 135, 25], inv: [1.6, 0.5, 0.3, 1.2, 0.2, 0, 1.5], el: 180, gas: 30,
      k: { invest: 5300000, annual: 412000, lcoh: 9.4, co2: 48, ren: 91, gas: 30, grid: 180 } },
    { short: 'Wärmepumpe', network: true,
      comps: [['Wärmenetz', ''], ['Fluss-Wärmepumpe', '420 kW'], ['Industrielle Abwärme', ''], ['Luft-Wärmepumpe', '120 kW'], ['Gaskessel (Spitzenlast)', ''], ['Pufferspeicher', '40 MWh']],
      opex: 133000, cost: [205000, 43000, 90000], mix: [760, 40, 320, 0, 50], inv: [3.4, 0.5, 0.3, 0, 0.2, 0.6, 1.4], el: 420, gas: 55,
      k: { invest: 6400000, annual: 338000, lcoh: 8.1, co2: 62, ren: 86, gas: 55, grid: 420 } },
    { short: 'Gaskessel', network: true,
      comps: [['Wärmenetz', ''], ['Industrielle Abwärme', ''], ['Gaskessel', '1,2 MW']],
      opex: 418000, cost: [68000, 30000, 388000], mix: [0, 0, 320, 0, 850], inv: [0, 0, 0.3, 0, 0.4, 0, 1.4], el: 20, gas: 980,
      k: { invest: 2100000, annual: 486000, lcoh: 11.0, co2: 210, ren: 24, gas: 980, grid: 20 } },
    { short: 'Dezentrale Wärmepumpen', network: false,
      comps: [['Luft-Wärmepumpen in 86 Gebäuden', '']],
      opex: 121000, cost: [250000, 26000, 95000], mix: [0, 1100, 0, 0, 0], inv: [0, 7.9, 0, 0, 0, 0, 0], el: 510, gas: 0,
      k: { invest: 7900000, annual: 371000, lcoh: 9.0, co2: 70, ren: 83, gas: 0, grid: 510 } }
  ],

  // Single scenario page: sections > subsections > charts/KPIs. def: shown by default
  // (the others can be added with "+ Diagramm"). kind: kpi, hbar, vbar, donut, share, plot, flow, diagram.
  catalog: (function () {
  // Chart palette: one colour family per component category, steps by lightness.
  // Tested for protanopia, deuteranopia and tritanopia: every pair shown together
  // stays at least ΔE2000 12 apart.
  const PALETTE = {
    heatPump: ['#2B7FBF', '#9FCDEC'],     // heat_pump, geothermal
    combustion: ['#B85C14', '#E6A266'],   // chp, biogas_plant, biomass
    wasteHeat: ['#62AE6E', '#A9D6B0'],    // waste heat, solar_thermal_plant
    fossil: ['#5C6670', '#C9C2B6'],       // gas_boiler, diesel_generator; light = losses
    network: ['#1F567D'],                 // heating_network, dso, buses
    storage: ['#7E5BB0'],                 // hess, bess, gess
    costs: ['#1F567D', '#4A90C4', '#A9CDE8'],
    renewable: ['#62AE6E', '#B5BEC6']
  };
  const C = {
    flussWp: PALETTE.heatPump[0], luftWp: PALETTE.heatPump[1], abwaerme: PALETTE.wasteHeat[0],
    bhkw: PALETTE.combustion[0], gas: PALETTE.fossil[0], netz: PALETTE.network[0],
    invest: PALETTE.costs[0], fix: PALETTE.costs[1], variabel: PALETTE.costs[2], ersatz: PALETTE.combustion[0],
    ee: PALETTE.renewable[0], nonEe: PALETTE.renewable[1]
  };
  const GEN = [
    ['Fluss-Wärmepumpe', C.flussWp], ['Industrielle Abwärme', C.abwaerme], ['Biomasse-BHKW', C.bhkw],
    ['Luft-Wärmepumpe', C.luftWp], ['Gaskessel', C.gas]
  ];
  const one = (name, unit, color, rows) => ({ unit: unit, series: [{ name: name, color: color }], rows: rows.map((r) => ({ label: r[0], values: [r[1]], color: r[2] })) });
  return [
    { id: 'overview', title: 'Überblick', short: 'Überblick', subs: [
      { id: 'kpis', title: 'Kennzahlen', items: [
        { id: 'kpi-main', title: 'Wichtigste Kennzahlen', kind: 'kpi', def: true, tiles: [
          { label: 'Investitionskosten (Jahr 0)', value: '5.300.000', unit: '€', num: 5300000, cmp: 6100000, better: 'low', def: 'Summe der Investitionskosten aller Komponenten zu Projektbeginn.' },
          { label: 'Jährliche Gesamtkosten', value: '412.000', unit: '€/a', num: 412000, cmp: 438000, better: 'low', def: 'Annuität der Investitionen plus jährliche Betriebs- und Verbrauchskosten.' },
          { label: 'Energiegestehungskosten', value: '9,4', unit: 'ct/kWh', num: 9.4, cmp: 10.1, better: 'low', def: 'Jährliche Gesamtkosten geteilt durch die insgesamt bereitgestellte Energie.' },
          { label: 'Erneuerbarer Anteil (gesamt)', value: '72', unit: '%', num: 72, cmp: 81, better: 'high', def: 'Anteil erneuerbarer Energie an der gesamten Energiebereitstellung des Systems.' }] }] },
      { id: 'system', title: 'Energiesystem', items: [
        { id: 'system-diagram', title: 'Auslegung des Energiesystems', kind: 'diagram', def: true }] },
      { id: 'flows', title: 'Energieflüsse', items: [
        { id: 'sankey', title: 'Sankey-Diagramm', kind: 'flow', def: true }] }] },
    { id: 'energy', title: 'Energie', short: 'Energie', subs: [
      { id: 'mix', title: 'Energiemix', items: [
        { id: 'energy-mix', title: 'Kumulierte Energiebereitstellung', kind: 'hbar', def: true, labelHead: 'Erzeuger',
          data: one('Wärme', 'MWh/a', C.netz, [['Fluss-Wärmepumpe', 545, C.flussWp], ['Industrielle Abwärme', 320, C.abwaerme], ['Luft-Wärmepumpe', 145, C.luftWp], ['Biomasse-BHKW', 135, C.bhkw], ['Gaskessel', 25, C.gas]]) },
        { id: 'mix-pie', title: 'Energiemix nach Energieträger', kind: 'donut', hint: 'Anteile als Kreisdiagramm', labelHead: 'Energieträger', unit: 'MWh/a',
          parts: [['Umweltwärme und Strom', 690, C.flussWp], ['Abwärme', 320, C.abwaerme], ['Biomasse', 135, C.bhkw], ['Erdgas', 25, C.gas]] }] },
      { id: 'timeseries', title: 'Zeitreihen', items: [
        { id: 'ts', title: 'Wärmebedarf und Erzeugung (Tagesmittel)', kind: 'plot', plot: 'ts', def: true },
        { id: 'ts-stacked', title: 'Gestapelte Erzeugung (Tagesmittel)', kind: 'plot', plot: 'stack' }] },
      { id: 'duration', title: 'Lastdauerlinien', items: [
        { id: 'load-duration', title: 'Lastdauerlinie Wärmebedarf', kind: 'plot', plot: 'duration', def: true }] },
      { id: 'balance', title: 'Bedarf und Überschuss', items: [
        { id: 'kpi-balance', title: 'Bedarf, Überschuss, Einspeisung', kind: 'kpi', def: true, tiles: [
          { label: 'Gesamtbedarf', value: '1.100', unit: 'MWh/a', def: 'Summe aller Wärme- und Strombedarfe im System.' },
          { label: 'Überschuss', value: '42', unit: 'MWh/a', def: 'Erzeugte Energie, die weder genutzt noch eingespeist werden konnte.' },
          { label: 'Einspeisung', value: '18,5', unit: 'MWh/a', def: 'Ins öffentliche Netz eingespeiste Energie.' },
          { label: 'Bezug vom Versorger', value: '396', unit: 'MWh/a', def: 'Aus öffentlichen Netzen bezogene Energie (Strom, Gas).' }] }] }] },
    { id: 'assets', title: 'Anlagen & Kapazitäten', short: 'Anlagen', subs: [
      { id: 'capacities', title: 'Kapazitäten', items: [
        { id: 'capacities', title: 'Installierte und optimierte Kapazitäten', kind: 'hbar', def: true, labelHead: 'Anlage', total: true,
          data: { unit: 'kW', series: [{ name: 'Installiert', color: C.netz }, { name: 'Optimiert (Zubau)', color: C.fix }],
            rows: [{ label: 'Fluss-Wärmepumpe', values: [150, 60] }, { label: 'Industrielle Abwärme', values: [100, 0] }, { label: 'Biomasse-BHKW', values: [40, 20] }, { label: 'Luft-Wärmepumpe', values: [40, 35] }, { label: 'Gaskessel', values: [50, 0] }] } }] },
      { id: 'power', title: 'Leistung', items: [
        { id: 'peak', title: 'Spitzenleistung je Anlage', kind: 'hbar', def: true, labelHead: 'Anlage',
          data: one('Spitzenleistung', 'kW', C.netz, [['Fluss-Wärmepumpe', 205], ['Industrielle Abwärme', 95], ['Luft-Wärmepumpe', 72], ['Biomasse-BHKW', 58], ['Gaskessel', 41]]) },
        { id: 'avg', title: 'Durchschnittsleistung je Anlage', kind: 'hbar', labelHead: 'Anlage',
          data: one('Durchschnittsleistung', 'kW', C.fix, [['Fluss-Wärmepumpe', 62], ['Industrielle Abwärme', 37], ['Luft-Wärmepumpe', 17], ['Biomasse-BHKW', 15], ['Gaskessel', 3]]) }] },
      { id: 'storage', title: 'Speicher', items: [
        { id: 'soc', title: 'Füllstand Pufferspeicher (Beispielwoche Januar)', kind: 'plot', plot: 'soc', def: true }] }] },
    { id: 'costs', title: 'Kosten', short: 'Kosten', subs: [
      { id: 'breakdown', title: 'Kostenaufteilung', items: [
        { id: 'cost-breakdown', title: 'Annualisierte Kostenaufteilung', kind: 'hbar', def: true, labelHead: 'Anlage', total: true,
          data: { unit: '€/a', series: [{ name: 'Annuität Investition', color: C.invest }, { name: 'Fixe Betriebskosten', color: C.fix }, { name: 'Variable Kosten', color: C.variabel }],
            rows: [{ label: 'Wärmenetz', values: [168000, 34000, 0] }, { label: 'Fluss-Wärmepumpe', values: [66000, 30000, 14000] }, { label: 'Biomasse-BHKW', values: [22000, 17000, 9000] }, { label: 'Luft-Wärmepumpe', values: [16000, 6000, 5000] }, { label: 'Industrielle Abwärme', values: [7000, 7000, 2000] }, { label: 'Gaskessel', values: [0, 4000, 5000] }] } },
        { id: 'cost-pie', title: 'Kostenanteile', kind: 'donut', hint: 'Anteile als Kreisdiagramm', labelHead: 'Kostenart', unit: '€/a',
          parts: [['Annuität Investition', 279000, C.invest], ['Fixe Betriebskosten', 98000, C.fix], ['Variable Kosten', 35000, C.variabel]] }] },
      { id: 'capex-opex', title: 'Investition und Betrieb', items: [
        { id: 'capex', title: 'Investitionskosten (Jahr 0) je Anlage', kind: 'hbar', def: true, labelHead: 'Anlage',
          data: one('Investition', '€', C.invest, [['Wärmenetz', 3200000], ['Fluss-Wärmepumpe', 1250000], ['Biomasse-BHKW', 420000], ['Luft-Wärmepumpe', 300000], ['Industrielle Abwärme', 130000], ['Gaskessel', 0]]) },
        { id: 'opex', title: 'Betriebs- und Wartungskosten', kind: 'hbar', def: true, labelHead: 'Anlage',
          // Example of the "no data" state: in this scenario no O&M costs are set on the components
          noData: { reason: 'Für dieses Szenario sind bei keiner Komponente Betriebs- und Wartungskosten hinterlegt.', action: 'Kosten in „Auslegung des Energiesystems“ ergänzen' },
          data: one('Betrieb und Wartung', '€/a', C.fix, [['Wärmenetz', 42000], ['Fluss-Wärmepumpe', 38000], ['Biomasse-BHKW', 21000], ['Gaskessel', 15000], ['Industrielle Abwärme', 9000], ['Luft-Wärmepumpe', 8000]]) },
        { id: 'replacement', title: 'Ersatzinvestitionen über die Laufzeit', kind: 'hbar', labelHead: 'Anlage',
          data: one('Ersatzinvestition', '€', C.ersatz, [['Fluss-Wärmepumpe (2046)', 380000], ['Biomasse-BHKW (2041)', 210000], ['Luft-Wärmepumpe (2046)', 180000], ['Gaskessel (2051)', 40000]]) },
        { id: 'lifetime', title: 'Kosten über die Projektlaufzeit', kind: 'vbar', labelHead: 'Zeitraum',
          data: { unit: '€', series: [{ name: 'Investition', color: C.invest }, { name: 'Betrieb', color: C.fix }, { name: 'Ersatz', color: C.ersatz }],
            rows: [{ label: 'Jahr 0', values: [5300000, 0, 0] }, { label: 'Jahre 1–5', values: [0, 665000, 0] }, { label: 'Jahre 6–10', values: [0, 665000, 0] }, { label: 'Jahre 11–15', values: [0, 665000, 210000] }, { label: 'Jahre 16–20', values: [0, 665000, 560000] }] } }] },
      { id: 'lcoe', title: 'Gestehungskosten', items: [
        { id: 'lcoe-asset', title: 'Gestehungskosten je Anlage', kind: 'hbar', def: true, labelHead: 'Anlage', decimals: 1,
          data: one('Gestehungskosten', 'ct/kWh', C.netz, [['Gaskessel', 12.0], ['Biomasse-BHKW', 11.3], ['Luft-Wärmepumpe', 10.2], ['Fluss-Wärmepumpe', 7.6], ['Industrielle Abwärme', 4.1]]) },
        { id: 'lcoe-eq', title: 'Gestehungskosten je Energieträger', kind: 'kpi', tiles: [
          { label: 'Gesamt', value: '9,4', unit: 'ct/kWh' }, { label: 'Strom', value: '21,8', unit: 'ct/kWh' }, { label: 'Wärme', value: '8,2', unit: 'ct/kWh' }, { label: 'Gas', value: '11,9', unit: 'ct/kWh' }] }] }] },
    { id: 'environment', title: 'Umwelt', short: 'Umwelt', subs: [
      { id: 'renewables', title: 'Erneuerbare Energien', items: [
        { id: 'renewable-split', title: 'Erneuerbar vs. nicht erneuerbar', kind: 'share', def: true, labelHead: 'Kategorie', unit: 'MWh/a',
          parts: [['Erneuerbar', 842, C.ee], ['Nicht erneuerbar', 328, C.nonEe]] },
        { id: 'renewable-local', title: 'Erneuerbarer Anteil an lokaler Erzeugung', kind: 'kpi', tiles: [
          { label: 'Erneuerbarer Anteil (lokal)', value: '78', unit: '%', def: 'Anteil erneuerbarer Quellen an der Erzeugung innerhalb des Systems, ohne Netzbezug.' },
          { label: 'Erneuerbare Erzeugung', value: '858', unit: 'MWh/a' },
          { label: 'Nicht erneuerbare Erzeugung', value: '242', unit: 'MWh/a' },
          { label: 'Lokale Erzeugung gesamt', value: '1.100', unit: 'MWh/a' }] }] },
      { id: 'emissions', title: 'Emissionen', items: [
        { id: 'kpi-emissions', title: 'Gesamtemissionen', kind: 'kpi', def: true, tiles: [
          { label: 'Gesamtemissionen', value: '186', unit: 't CO₂-Äq./a', num: 186, cmp: 142, better: 'low', def: 'Treibhausgasemissionen aus Brennstoffen und Netzbezug pro Jahr.' },
          { label: 'Spezifische Emissionen', value: '0,17', unit: 'kg CO₂-Äq./kWh', num: 0.17, cmp: 0.13, better: 'low', def: 'Emissionen je bereitgestellter Kilowattstunde.' },
          { label: 'Emissionen Strom', value: '61', unit: 't CO₂-Äq./a', num: 61, cmp: 98, better: 'low' },
          { label: 'Emissionen Wärme', value: '125', unit: 't CO₂-Äq./a', num: 125, cmp: 44, better: 'low' }] }] },
      { id: 'autarky', title: 'Autarkie und Eigenverbrauch', items: [
        { id: 'kpi-autarky', title: 'Autarkiegrad und Eigenverbrauch', kind: 'kpi', def: true, tiles: [
          { label: 'Autarkiegrad', value: '64', unit: '%', num: 64, cmp: 58, better: 'high', def: 'Anteil des Bedarfs, der durch Erzeugung im System gedeckt wird.' },
          { label: 'Eigenverbrauchsanteil', value: '81', unit: '%', num: 81, cmp: 77, better: 'high', def: 'Anteil der Erzeugung im System, der im System selbst verbraucht wird.' },
          { label: 'Netto-Null-Grad', value: '58', unit: '%', num: 58, cmp: 52, better: 'high', def: 'Verhältnis von erneuerbarer Erzeugung im System zum Energiebezug aus dem Netz.' },
          { label: 'Lokale Deckung', value: '70', unit: '%', num: 70, cmp: 66, better: 'high', def: 'Anteil der Stunden, in denen der Bedarf vollständig lokal gedeckt wird.' }] }] }] },
    { id: 'components', title: 'Komponenten', short: 'Komponenten', subs: [
      { id: 'quartier', title: 'Wärmebedarf Quartier', items: [
        { id: 'q-connections', title: 'Wärmeverbrauch nach Anschluss', kind: 'donut', def: true, labelHead: 'Anschluss', unit: 'MWh/a',
          parts: [['Wärmenetz', 930, C.netz], ['Luft-Wärmepumpe', 145, C.luftWp], ['Gaskessel', 25, C.gas]] },
        { id: 'q-buildings', title: 'Wärmeverbrauch nach Gebäude', kind: 'hbar', def: true, labelHead: 'Gebäude', total: true, totalHead: 'Bedarf',
          data: { unit: 'MWh/a', series: [{ name: 'Wärmenetz', color: C.netz }, { name: 'Luft-Wärmepumpe', color: C.luftWp }, { name: 'Gaskessel', color: C.gas }],
            rows: [{ label: 'Bildung', values: [500, 0, 0] }, { label: 'Gewerbehof', values: [280, 70, 0] }, { label: 'Wohnen', values: [150, 75, 25] }] } },
        { id: 'q-central', title: 'Zentral vs. dezentral', kind: 'kpi', hint: 'Gestehungskosten, Investition, Betrieb, Bezug', tiles: [
          { label: 'Wärmegestehungskosten', value: '8–12', unit: 'ct/kWh' }, { label: 'Investitionskosten', value: '5.300.000', unit: '€' }, { label: 'Betriebskosten', value: '133.000', unit: '€/a' }, { label: 'Gesamter Bezug', value: '1.100', unit: 'MWh/a' }] }] }] }
  ];
  })()
};


/* ==========================================================================================
   2. VIEW MODEL
   ------------------------------------------------------------------------------------------
   From the canvas prototype. state: what the user has opened, hidden, selected.
   renderVals() returns everything the templates in part 3 use.
   ========================================================================================== */
class ResultsLogic {
  constructor() {
    this.state = {
      menu: null,
      compare: false,
      project: 0,
      scenario: 0,
      compared: [0, 1, 2, 3],
      cmpHint: true,
      cmpTarget: null,
      compOpen: false,    // component lists in the scenario cards (all cards together)    // scenario compared with the reference in the cost waterfall      // comparability hint, can be hidden for good (saved per user)
      pair: 0,            // axes of the trade-off chart
      section: 'overview',
      notice: true,        // development notice (hidden for good with "Nicht mehr anzeigen")
      scrolled: false,
      sbw: 0,             // scrollbar width, so the pinned bar does not cover it
      shown: null,       // { subId: [itemId, ...] } – null = catalogue defaults
      hiddenSubs: {},    // { subId: true }
      collapsed: {},     // { subId: true }
      flash: null,       // subsection briefly highlighted after a jump
      tables: {},        // { itemId: true } – table view opened under a chart
      tip: null,         // KPI definition currently shown
      announce: ''       // text for the screen-reader live region
    };
  }

  // Catalogue: every chart/KPI with its section, subsection and default visibility.
  // In the app this is a static config; the user's view is stored only as the difference to it.
  // All numbers are invented sample data, kept consistent across charts, tables and KPIs.
  catalog() { return RESULTS_DATA.catalog; }

  // ---------- sample time series (computed once) ----------
  series() {
    if (this._series) { return this._series; }
    const rnd = (i) => { const x = Math.sin(i * 12.9898) * 43758.5453; return x - Math.floor(x); };
    const days = [];
    for (let d = 0; d < 365; d += 1) {
      const season = 1 + 0.72 * Math.cos(2 * Math.PI * (d - 12) / 365);
      days.push(Math.max(18, 125 * season * (0.88 + 0.24 * rnd(d + 1))));
    }
    const hours = [];
    for (let h = 0; h < 8760; h += 1) {
      const day = days[Math.floor(h / 24)];
      hours.push(Math.max(8, day * (1 + 0.28 * Math.sin(2 * Math.PI * ((h % 24) - 9) / 24)) * (0.92 + 0.16 * rnd(h + 7))));
    }
    const sorted = hours.slice().sort((a, b) => b - a);
    const duration = [];
    for (let i = 0; i < 200; i += 1) { duration.push(sorted[Math.floor(i * 8759 / 199)]); }
    const stack = days.map((dem) => {
      let rest = dem;
      const take = (cap) => { const v = Math.min(cap, rest); rest -= v; return v; };
      return [take(36), take(118), take(32), take(38), Math.max(0, rest)]; // Abwärme, Fluss-WP, BHKW, Luft-WP, Gas
    });
    const soc = [];
    for (let h = 0; h < 168; h += 1) {
      soc.push(Math.min(96, Math.max(8, 52 + 34 * Math.sin(2 * Math.PI * (h - 4) / 24) + 8 * Math.sin(2 * Math.PI * h / 168) + 6 * (rnd(h + 3) - 0.5))));
    }
    this._series = { days: days, stack: stack, duration: duration, soc: soc };
    return this._series;
  }

  // ---------- turn a catalogue item into chart + table data for the template ----------
  chart(it) {
    const de = (v, dec) => Number(v).toLocaleString('de-DE', { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 });
    const pct = (v) => de(v, 1) + ' %';
    const niceMax = (m) => {
      const p = Math.pow(10, Math.floor(Math.log10(m)));
      const f = m / p;
      const steps = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
      return steps.find((x) => f <= x) * p;
    };
    const short = (v) => (v >= 1e6 ? de(v / 1e6, 1) + ' Mio.' : v >= 1e4 ? de(v / 1e3) + ' Tsd.' : de(v));
    const out = { hbar: false, donut: false, share: false, plot: false, vbar: false, legend: [], table: null, empty: false };
    if (it.noData) {
      out.empty = true;
      out.emptyReason = it.noData.reason;
      out.emptyAction = it.noData.action;
      return out;
    }
    const emptyPath = { d: 'M0 0', fill: 'none', stroke: 'none' };

    if (it.kind === 'hbar' || it.kind === 'vbar') {
      const d = it.data;
      const totals = d.rows.map((r) => r.values.reduce((a, b) => a + b, 0));
      const max = Math.max.apply(null, totals) || 1;
      out.legend = d.series.length > 1 ? d.series.map((s) => ({ name: s.name, color: s.color })) : [];
      out.hasLegend = out.legend.length > 0;
      const rows = d.rows.map((r, i) => ({
        label: r.label,
        valueText: de(totals[i], it.decimals) + ' ' + d.unit,
        shortText: short(totals[i]),
        h: (totals[i] / max) * 100,
        segs: r.values.map((v, si) => ({
          w: (v / max) * 100,
          h: totals[i] ? (v / totals[i]) * 100 : 0,
          color: r.color || d.series[si].color,
          title: d.series[si].name + ': ' + de(v, it.decimals) + ' ' + d.unit
        })).filter((g) => g.w > 0)
      }));
      if (it.kind === 'hbar') { out.hbar = true; out.hrows = rows; }
      else { out.vbar = true; out.vcols = rows; out.vMax = short(max) + ' ' + d.unit; }
      const multi = d.series.length > 1;
      out.table = {
        cols: [it.labelHead].concat(d.series.map((s) => (multi ? s.name : s.name + ' (' + d.unit + ')'))).concat(multi && it.total !== false ? [(it.totalHead || 'Gesamt') + ' (' + d.unit + ')'] : []),
        rows: d.rows.map((r, i) => [r.label].concat(r.values.map((v) => de(v, it.decimals))).concat(multi && it.total !== false ? [de(totals[i], it.decimals)] : []))
      };
      out.aria = it.title + ': ' + rows.map((r) => r.label + ' ' + r.valueText).join('; ') + (multi ? '. Aufteilung in der Tabelle.' : '');
    }

    if (it.kind === 'donut' || it.kind === 'share') {
      const total = it.parts.reduce((a, p) => a + p[1], 0);
      const CIRC = 2 * Math.PI * 60;
      let acc = 0;
      const parts = it.parts.map((p) => {
        const share = (p[1] / total) * 100;
        const seg = { name: p[0], color: p[2], value: de(p[1]) + ' ' + it.unit, pct: pct(share), w: share,
          dash: Math.max(0, share / 100 * CIRC - 2).toFixed(2) + ' ' + CIRC.toFixed(2), off: (-acc / 100 * CIRC).toFixed(2) };
        acc += share;
        return seg;
      });
      out.parts = parts;
      for (let i = 0; i < 6; i += 1) {
        out['d' + i] = parts[i] || { color: 'none', dash: '0 1000', off: '0' };
      }
      out.donutTotal = short(total);
      out.donutUnit = it.unit;
      out[it.kind] = true;
      out.table = { cols: [it.labelHead, 'Wert (' + it.unit + ')', 'Anteil'], rows: it.parts.map((p, i) => [p[0], de(p[1]), parts[i].pct]) };
      out.aria = it.title + ': ' + parts.map((p) => p.name + ' ' + p.pct + ' (' + p.value + ')').join('; ');
    }

    if (it.kind === 'plot') {
      const S = this.series();
      const W = 1000, H = 200;
      const line = (vals, max) => vals.map((v, i) => (i ? 'L' : 'M') + (i / (vals.length - 1) * W).toFixed(1) + ' ' + (H - v / max * H).toFixed(1)).join(' ');
      const area = (lo, hi, max) => {
        const top = hi.map((v, i) => (i ? 'L' : 'M') + (i / (hi.length - 1) * W).toFixed(1) + ' ' + (H - v / max * H).toFixed(1)).join(' ');
        const bottom = lo.slice().reverse().map((v, i) => 'L' + ((lo.length - 1 - i) / (lo.length - 1) * W).toFixed(1) + ' ' + (H - v / max * H).toFixed(1)).join(' ');
        return top + ' ' + bottom + ' Z';
      };
      const paths = [];
      let max = 1, unit = 'kW';
      const months = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
      const monthNames = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
      out.xlabels = months.map((m) => ({ text: m }));
      // daily values grouped by month, for summary tables and screen-reader text
      const LEN = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      const byMonth = (vals) => { let k = 0; return LEN.map((n) => { const part = vals.slice(k, k + n); k += n; return part; }); };
      const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
      const argMax = (a) => a.indexOf(Math.max.apply(null, a));
      const argMin = (a) => a.indexOf(Math.min.apply(null, a));
      if (it.plot === 'ts') {
        const net = S.days.map((v) => v * 0.84);
        max = niceMax(Math.max.apply(null, S.days));
        paths.push({ d: area(S.days.map(() => 0), S.days, max), fill: 'rgba(52, 52, 52, 0.06)', stroke: 'none' });
        paths.push({ d: line(S.days, max), fill: 'none', stroke: '#343434' });
        paths.push({ d: line(net, max), fill: 'none', stroke: '#1F567D' });
        out.legend = [{ name: 'Wärmebedarf Quartier', color: '#343434' }, { name: 'Bezug aus Wärmenetz', color: '#1F567D' }];
        const mDem = byMonth(S.days).map(mean);
        const mNet = byMonth(net).map(mean);
        out.table = { cols: ['Monat', 'Wärmebedarf Ø (kW)', 'Bezug Wärmenetz Ø (kW)'], rows: monthNames.map((m, i) => [m, de(mDem[i]), de(mNet[i])]) };
        out.aria = it.title + ', Jahresverlauf. Wärmebedarf am höchsten im ' + monthNames[argMax(mDem)] + ' (Ø ' + de(Math.max.apply(null, mDem)) + ' kW), am niedrigsten im ' + monthNames[argMin(mDem)] + ' (Ø ' + de(Math.min.apply(null, mDem)) + ' kW). Der Bezug aus dem Wärmenetz deckt rund 84 % des Bedarfs. Monatswerte in der Tabelle.';
      } else if (it.plot === 'stack') {
        const step = S.stack.filter((_, i) => i % 2 === 0);
        const names = [['Industrielle Abwärme', '#62AE6E'], ['Fluss-Wärmepumpe', '#2B7FBF'], ['Biomasse-BHKW', '#B85C14'], ['Luft-Wärmepumpe', '#9FCDEC'], ['Gaskessel', '#5C6670']];
        const cum = step.map(() => 0);
        max = niceMax(Math.max.apply(null, step.map((r) => r.reduce((a, b) => a + b, 0))));
        names.forEach((n, k) => {
          const lo = cum.slice();
          step.forEach((r, i) => { cum[i] += r[k]; });
          paths.push({ d: area(lo, cum.slice(), max), fill: n[1], stroke: 'none' });
        });
        out.legend = names.map((n) => ({ name: n[0], color: n[1] }));
        const groups = byMonth(S.stack);
        const mwh = groups.map((g) => names.map((_, k) => g.reduce((a, r) => a + r[k], 0) * 24 / 1000));
        out.table = {
          cols: ['Monat'].concat(names.map((n) => n[0])).concat(['Gesamt (MWh)']),
          rows: monthNames.map((m, i) => [m].concat(mwh[i].map((v) => de(v))).concat([de(mwh[i].reduce((a, b) => a + b, 0))]))
        };
        const year = names.map((_, k) => mwh.reduce((a, r) => a + r[k], 0));
        const yearTotal = year.reduce((a, b) => a + b, 0);
        out.aria = it.title + ', Jahresverlauf. Anteile am Jahr: ' + names.map((n, k) => n[0] + ' ' + pct(year[k] / yearTotal * 100)).join('; ') + '. Gaskessel nur im Winter. Monatswerte in MWh in der Tabelle.';
      } else if (it.plot === 'duration') {
        max = niceMax(S.duration[0]);
        paths.push({ d: area(S.duration.map(() => 0), S.duration, max), fill: 'rgba(31, 86, 125, 0.12)', stroke: 'none' });
        paths.push({ d: line(S.duration, max), fill: 'none', stroke: '#1F567D' });
        out.xlabels = ['0 h', '2.190 h', '4.380 h', '6.570 h', '8.760 h'].map((m) => ({ text: m }));
        out.legend = [];
        const at = (h) => S.duration[Math.round(h * 199 / 8759)];
        const marks = [['Höchstlast', 0], ['1.000 h', 1000], ['2.000 h', 2000], ['4.380 h (Hälfte des Jahres)', 4380], ['6.570 h', 6570], ['Mindestlast', 8759]];
        out.table = { cols: ['Stunden im Jahr', 'Last mindestens (kW)'], rows: marks.map((m) => [m[0], de(at(m[1]))]) };
        out.aria = it.title + ': Höchstlast ' + de(at(0)) + ' kW, nach 4.380 Stunden ' + de(at(4380)) + ' kW, Mindestlast ' + de(at(8759)) + ' kW. Werte in der Tabelle.';
      } else if (it.plot === 'soc') {
        max = 100; unit = '%';
        paths.push({ d: area(S.soc.map(() => 0), S.soc, max), fill: 'rgba(126, 91, 176, 0.14)', stroke: 'none' });
        paths.push({ d: line(S.soc, max), fill: 'none', stroke: '#7E5BB0' });
        out.xlabels = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((m) => ({ text: m }));
        out.legend = [];
        const dayNames = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
        const daysSoc = dayNames.map((_, d) => S.soc.slice(d * 24, d * 24 + 24));
        out.table = { cols: ['Tag', 'Minimum', 'Maximum'], rows: dayNames.map((dn, d) => [dn, pct(Math.min.apply(null, daysSoc[d])), pct(Math.max.apply(null, daysSoc[d]))]) };
        out.aria = it.title + ': Der Speicher wird täglich geladen und entladen, zwischen ' + pct(Math.min.apply(null, S.soc)) + ' und ' + pct(Math.max.apply(null, S.soc)) + '. Tageswerte in der Tabelle.';
      }
      out.plot = true;
      out.hasLegend = out.legend.length > 0;
      out.yTop = de(max) + ' ' + unit;
      out.yMid = de(max / 2) + ' ' + unit;
      for (let i = 0; i < 5; i += 1) { out['p' + i] = paths[i] || emptyPath; }
    }
    return out;
  }

  defaults() {
    const out = {};
    this.catalog().forEach((sec) => sec.subs.forEach((sub) => {
      out[sub.id] = sub.items.filter((i) => i.def).map((i) => i.id);
    }));
    return out;
  }

  renderVals() {
    const st = this.state;
    const self = this;
    const PROJECTS = RESULTS_DATA.projects;
    const SCENARIOS = RESULTS_DATA.scenarioNames;
    const LETTERS = RESULTS_DATA.letters;
    const toggle = (name) => () => self.setState({ menu: self.state.menu === name ? null : name });

    const projects = PROJECTS.map((name, i) => {
      const sel = i === st.project;
      return {
        name: name, selected: sel, selStr: sel ? 'true' : 'false',
        bg: sel ? '#F3F7FC' : '#ffffff', weight: sel ? 700 : 400,
        pick: () => self.setState({ project: i, menu: null })
      };
    });

    const scenarios = SCENARIOS.map((name, i) => {
      const isCurrent = i === st.scenario;
      const inCompare = isCurrent || st.compared.indexOf(i) !== -1;
      const sel = st.compare ? inCompare : i === st.scenario;
      return {
        name: st.compare ? LETTERS[i] + ' · ' + name : name, selStr: sel ? 'true' : 'false',
        isCurrent: st.compare && isCurrent,
        showCheck: !st.compare && sel,
        bg: sel ? '#F3F7FC' : '#ffffff', weight: sel ? 700 : 400,
        boxBorder: inCompare ? '#1F567D' : '#A8B5C0', boxBg: inCompare ? '#1F567D' : '#ffffff',
        pick: () => {
          if (self.state.compare) {
            if (i === self.state.scenario) { return; } // the current scenario always stays in the comparison
            const cur = self.state.compared;
            const next = cur.indexOf(i) !== -1 ? cur.filter((x) => x !== i) : cur.concat([i]).sort();
            self.setState({ compared: next.length ? next : cur });
          } else {
            // single mode: this also changes the scenario shown in the step area
            self.setState({ scenario: i, menu: null, compared: [i] });
          }
        }
      };
    });

    const compared = st.compared.indexOf(st.scenario) !== -1 ? st.compared : [st.scenario].concat(st.compared);
    const n = compared.length;
    // Smooth jump inside the page's scroll area. Scrolls directly (no state callback),
    // and aims for the collapsed bar height, since the bar collapses while scrolling down.
    const jump = (e, targetId) => {
      e.preventDefault();
      const box = e.currentTarget.closest('#results-scroll');
      const el = box && box.querySelector('#' + targetId);
      if (!el) { return; }
      const offset = 76; // collapsed pinned bar (52 px) + some air
      const top = el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - offset;
      const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      box.scrollTo({ top: Math.max(0, top), behavior: still ? 'auto' : 'smooth' });
    };
    const otherIdx = compared.filter((i) => i !== st.scenario)[0];
    const otherName = otherIdx == null ? null : SCENARIOS[otherIdx];
    const CATALOG = self.catalog();
    const SECTIONS = CATALOG.map((sec) => [sec.id, sec.title, sec.short]);
    const shown = st.shown || self.defaults();
    // msg goes to the live region, so screen-reader users hear what changed
    const setShown = (subId, list, msg) => self.setState({ shown: Object.assign({}, shown, { [subId]: list }), menu: null, announce: msg || '' });
    const countText = (k) => (k === 1 ? '1 Diagramm' : k + ' Diagramme');

    const content = CATALOG.map((sec) => {
      const subs = sec.subs.filter((sub) => !st.hiddenSubs[sub.id]).map((sub) => {
        const list = (shown[sub.id] || []).filter((id) => sub.items.some((i) => i.id === id));
        const byId = {};
        sub.items.forEach((i) => { byId[i.id] = i; });
        const open = !st.collapsed[sub.id];
        // Layout: KPI blocks, diagrams, flows and column charts always take the full row.
        // Other charts sit two per row; one left alone in a row (odd run) also takes the full row.
        const fullKinds = { kpi: 1, diagram: 1, flow: 1, vbar: 1 };
        const wideIds = {};
        let run = [];
        const closeRun = () => { if (run.length % 2 === 1) { wideIds[run[run.length - 1]] = true; } run = []; };
        list.forEach((x) => { if (fullKinds[byId[x].kind]) { wideIds[x] = true; closeRun(); } else { run.push(x); } });
        closeRun();
        // Subtle separators: a vertical line before the right chart of a pair,
        // a horizontal line above every further row.
        const sepFor = {};
        let col = 0;
        list.forEach((x, i) => {
          if (wideIds[x]) {
            sepFor[x] = i === 0 ? '' : 'border-top: 1px solid #E3EAEE; padding-top: 24px; margin-top: -8px';
            col = 0;
          } else if (col === 1) {
            sepFor[x] = 'border-left: 1px solid #E3EAEE; padding-left: 20px; margin-left: -20px';
            col = 0;
          } else {
            sepFor[x] = i === 0 ? '' : 'border-top: 1px solid #E3EAEE; padding-top: 24px; margin-top: -8px';
            col = 1;
          }
        });
        const items = list.map((id, idx) => {
          const it = byId[id];
          const menuKey = 'card:' + id;
          const wide = !!wideIds[id];
          const c = self.chart(it);
          const tbl = c.table;
          return {
            title: it.title,
            span: wide ? '1 / -1' : 'auto',
            c: c,
            isKpi: it.kind === 'kpi', isFlow: it.kind === 'flow', isDiagram: it.kind === 'diagram',
            tiles: (it.tiles || []).map((t, ti) => {
              const hasDelta = !!(st.compare && otherName && t.cmp != null);
              let deltaText = '', deltaColor = '#495965';
              if (hasDelta) {
                const diff = t.num - t.cmp;
                const unit = t.unit === '%' ? '%-Pkt.' : t.unit;
                const good = t.better === 'low' ? diff < 0 : diff > 0;
                deltaText = (diff < 0 ? '↓ ' : '↑ ') + Math.abs(diff).toLocaleString('de-DE', { maximumFractionDigits: 2 }) + ' ' + unit + (diff < 0 ? ' weniger' : ' mehr');
                deltaColor = diff === 0 ? '#495965' : (good ? '#13825F' : '#AB2134');
              }
              const tipKey = id + ':' + ti;
              const tipOpen = !!t.def && st.tip === tipKey;
              return Object.assign({}, t, {
                hasDef: !!t.def, defLabel: 'Definition: ' + t.label, hasDelta: hasDelta, deltaText: deltaText, deltaColor: deltaColor, deltaRef: 'als ' + otherName,
                tipId: 'tip-' + id + '-' + ti, tipOpen: tipOpen, tipStr: tipOpen ? 'true' : 'false',
                tipBg: tipOpen ? '#E3EAEE' : 'transparent', tipFg: tipOpen ? '#17405C' : '#8696A5',
                showTip: () => { if (self.state.tip !== tipKey) { self.setState({ tip: tipKey }); } },
                hideTip: () => { if (self.state.tip === tipKey) { self.setState({ tip: null }); } },
                toggleTip: () => self.setState({ tip: self.state.tip === tipKey ? null : tipKey })
              });
            }),
            showHeader: list.length > 1,
            srTitle: list.length === 1,
            tableId: 'table-' + id,
            noData: !!it.noData,
            exportColor: it.noData ? '#A8B5C0' : '#343434',
            sep: sepFor[id] || '',
            menuInCard: list.length > 1 && st.menu === menuKey,
            hasTable: !!tbl,
            tableOpen: !!(tbl && st.tables[id]),
            tableOpenStr: st.tables[id] ? 'true' : 'false',
            tableLabel: st.tables[id] ? 'Tabelle ausblenden' : 'Tabelle anzeigen',
            tableRot: st.tables[id] ? 90 : 0,
            toggleTable: () => self.setState({ tables: Object.assign({}, self.state.tables, { [id]: !self.state.tables[id] }) }),
            gridCols: tbl ? 'minmax(0, 2fr) repeat(' + (tbl.cols.length - 1) + ', minmax(0, 1fr))' : '1fr',
            cols: tbl ? tbl.cols.map((c, ci) => ({ text: c, align: ci === 0 ? 'left' : 'right' })) : [],
            rows: tbl ? tbl.rows.map((r) => ({ cells: r.map((c, ci) => ({ role: ci === 0 ? 'rowheader' : 'cell', text: c, align: ci === 0 ? 'left' : 'right', weight: ci === 0 ? 700 : 400, color: ci === 0 ? '#343434' : '#495965' })) })) : [],
            menuOpen: st.menu === menuKey, menuStr: st.menu === menuKey ? 'true' : 'false',
            menuBg: st.menu === menuKey ? '#F4F7F9' : 'transparent',
            menuLabel: 'Optionen für ' + it.title,
            toggleMenu: () => self.setState({ menu: self.state.menu === menuKey ? null : menuKey }),
            hide: () => setShown(sub.id, list.filter((x) => x !== id), '„' + it.title + '“ ausgeblendet. Über „+ Diagramm“ wieder hinzufügen.')
          };
        });
        const addKey = 'add:' + sub.id;
        const more = sub.items.filter((i) => list.indexOf(i.id) === -1).map((i) => ({
          title: i.title,
          hint: i.hint || '',
          hasHint: !!i.hint,
          add: () => setShown(sub.id, list.concat([i.id]), '„' + i.title + '“ hinzugefügt.')
        }));
        return {
          id: sub.id, anchor: 'sub-' + sub.id, title: sub.title, bodyId: 'body-' + sub.id,
          addLabel: 'Diagramm hinzufügen zu ' + sub.title,
          isSingle: items.length === 1,
          addOpen: st.menu === addKey, addStr: st.menu === addKey ? 'true' : 'false',
          addBg: st.menu === addKey ? '#E6F0F8' : 'transparent',
          toggleAdd: () => self.setState({ menu: self.state.menu === addKey ? null : addKey }),
          single: items.length === 1 ? items[0] : null,
          ring: st.flash === sub.id ? '0 0 0 3px #1F567D, 0 0 16px rgba(31, 86, 125, 0.08)' : '0 0 16px rgba(31, 86, 125, 0.08)',
          open: open, openStr: open ? 'true' : 'false', rot: open ? 90 : 0,
          toggle: () => self.setState({ collapsed: Object.assign({}, self.state.collapsed, { [sub.id]: open }) }),
          countLabel: countText(list.length) + (more.length === 1 ? ' · 1 weiteres' : more.length ? ' · ' + more.length + ' weitere' : ''),
          items: items, empty: items.length === 0,
          more: more, hasMore: more.length > 0
        };
      });
      const hiddenSubs = sec.subs.filter((sub) => st.hiddenSubs[sub.id]);
      return {
        id: sec.id, title: sec.title, subs: subs,
        empty: subs.length === 0,
        hiddenText: 'Ausgeblendet: ' + hiddenSubs.map((sub) => sub.title).join(', '),
        showAll: () => {
          const next = Object.assign({}, self.state.hiddenSubs);
          sec.subs.forEach((sub) => { delete next[sub.id]; });
          self.setState({ hiddenSubs: next });
        },
        links: subs.map((sub) => ({ title: sub.title, href: '#' + sub.anchor, go: (e) => jump(e, sub.anchor) }))
      };
    });

    // Sections with all subsections hidden disappear from the page and from the section bar
    // comparison mode: only sections that have a comparison version (see cmp.secs)
    const CMP_SECTIONS = { overview: 1, energy: 1, costs: 1 };
    const visibleSections = SECTIONS.filter((s) => (st.compare ? (s[0] === 'overview' || (n > 1 && CMP_SECTIONS[s[0]])) : content.some((sec) => sec.id === s[0] && sec.subs.length > 0)));
    const activeSection = visibleSections.some((s) => s[0] === st.section) ? st.section : (visibleSections[0] || [null])[0];


    // ---------- comparison: „Vergleich auf einen Blick“ ----------
    const cmp = (() => {
      const de = (v, dec) => Number(v).toLocaleString('de-DE', { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 });
      // invented sample results per scenario (A–D)
      const DATA = RESULTS_DATA.scenarios;
      const money = (v) => (Math.abs(v) >= 1e6 ? de(v / 1e6, 1) + ' Mio. €' : de(Math.round(v / 1000) * 1000) + ' €');
      const M = [
        { k: 'invest', label: 'Investitionskosten', better: 'low', fmt: money, noun: 'Investition' },
        { k: 'annual', label: 'Jährliche Gesamtkosten', better: 'low', fmt: (v) => money(v).replace(' €', ' €/a'), noun: 'Jahreskosten' },
        { k: 'lcoh', label: 'Energiegestehungskosten', better: 'low', fmt: (v) => de(v, 1) + ' ct/kWh', noun: 'Gestehungskosten' },
        { k: 'co2', label: 'CO₂-Emissionen', better: 'low', fmt: (v) => de(v) + ' t/a', noun: 'CO₂' },
        { k: 'ren', label: 'Erneuerbarer Anteil (gesamt)', better: 'high', fmt: (v) => de(v) + ' %', dfmt: (v) => de(v) + ' %-Pkt.', noun: 'erneuerbarer Anteil' },
        { k: 'gas', label: 'Erdgasbedarf', better: 'low', fmt: (v) => de(v) + ' MWh/a', noun: 'Erdgas' },
        { k: 'grid', label: 'Strombezug aus dem Netz', better: 'low', fmt: (v) => de(v) + ' MWh/a', noun: 'Strombezug' }
      ];
      const byK = {};
      M.forEach((m) => { byK[m.k] = m; });
      const ref = st.scenario;
      const RL = LETTERS[ref];
      const GOOD = '#13825F', BAD = '#AB2134', NEUTRAL = '#495965';
      // "↑ 1,1 Mio. € mehr", coloured by whether that is good
      const delta = (m, v, r) => {
        const d = v - r;
        if (Math.abs(d) < 1e-9) { return { text: 'gleich wie ' + RL, color: NEUTRAL }; }
        const good = m.better === 'low' ? d < 0 : d > 0;
        return { text: (d > 0 ? '↑ ' : '↓ ') + (m.dfmt || m.fmt)(Math.abs(d)) + (d > 0 ? ' mehr' : ' weniger'), color: good ? GOOD : BAD };
      };


      const scen = compared.map((i) => {
        const d = DATA[i];
        const isRef = i === ref;
        const R = DATA[ref];
        const refMap = {};
        R.comps.forEach((c) => { refMap[c[0]] = c[1]; });
        const own = {};
        d.comps.forEach((c) => { own[c[0]] = true; });
        const label = (c) => c[0] + (c[1] ? ' ' + c[1] : '');
        // components as labelled groups (no colour or border coding)
        let groups;
        if (isRef) {
          groups = [{ label: 'Komponenten', text: d.comps.map(label).join(', ') }];
        } else {
          const added = d.comps.filter((c) => !(c[0] in refMap)).map(label);
          const resized = d.comps.filter((c) => (c[0] in refMap) && refMap[c[0]] !== c[1]).map((c) => label(c) + ' statt ' + (refMap[c[0]] || '–'));
          const same = d.comps.filter((c) => (c[0] in refMap) && refMap[c[0]] === c[1]).map(label);
          const removed = R.comps.filter((c) => !own[c[0]]).map(label);
          groups = [
            ['Zusätzlich', added], ['Andere Größe', resized], ['Entfällt', removed], ['Gleich wie ' + RL, same]
          ].filter((g) => g[1].length).map((g) => ({ label: g[0], text: g[1].join(', ') }));
        }
        // short, rule-based statements (no AI text): costs, payback, CO₂ and the largest other deviation
        let points;
        if (isRef) {
          points = [{ text: 'Die anderen Szenarien werden mit diesem verglichen.', color: NEUTRAL, weight: 400 }];
        } else {
          const line = (m) => { const x = delta(m, d.k[m.k], R.k[m.k]); return { text: x.text + ' ' + m.noun, color: x.color, weight: 700 }; };
          points = [line(byK.invest), line(byK.annual)];
          // payback on operating costs (operation, maintenance, energy) – same basis as „Kumulierte Kosten“
          const dInv = d.k.invest - R.k.invest, dAnn = d.opex - R.opex;
          if (dInv > 0 && dAnn < 0) {
            const y = dInv / -dAnn;
            points.push({ text: y > 30 ? 'Mehrinvestition rechnet sich erst nach über 30 Jahren' : 'Mehrinvestition rechnet sich nach ca. ' + de(y) + ' Jahren', color: NEUTRAL, weight: 400 });
          } else if (dInv < 0 && dAnn > 0) {
            const y = -dInv / dAnn;
            points.push({ text: y > 30 ? 'Investitionsvorteil hält über 30 Jahre' : 'Investitionsvorteil ist nach ca. ' + de(y) + ' Jahren aufgebraucht', color: NEUTRAL, weight: 400 });
          }
          points.push(line(byK.co2));
          const rel = (m) => Math.abs(d.k[m.k] - R.k[m.k]) / Math.max(Math.abs(d.k[m.k]), Math.abs(R.k[m.k]), 1);
          const other = [byK.ren, byK.gas, byK.grid].sort((a, b) => rel(b) - rel(a))[0];
          if (rel(other) > 0.1) { points.push(line(other)); }
        }
        return {
          letter: LETTERS[i], short: d.short, isRef: isRef, notRef: !isRef,
          border: isRef ? '#1F567D' : '#E3EAEE', bg: isRef ? '#F3F7FC' : '#ffffff',
          groups: groups, points: points,
          // one toggle for all cards, so the lists stay side by side
          compsOpen: !!st.compOpen, compsStr: st.compOpen ? 'true' : 'false', compsRot: st.compOpen ? 90 : 0,
          compsId: 'comps-' + LETTERS[i], compsLabel: st.compOpen ? 'Komponenten ausblenden' : 'Komponenten anzeigen',
          toggleComps: () => self.setState({ compOpen: !self.state.compOpen }), vsTitle: isRef ? 'Bezugsszenario' : 'Gegenüber ' + RL,
          refLabel: 'Szenario ' + LETTERS[i] + ' als Bezug verwenden',
          makeRef: () => self.setState({ scenario: i, announce: 'Szenario ' + LETTERS[i] + ' ist jetzt das Bezugsszenario.' })
        };
      });

      // table rows: unit in the row label, plain numbers in the cells, light group headers
      const UNIT = {
        invest: ['Mio. €', (v) => de(v / 1e6, 1)], annual: ['€/a', (v) => de(Math.round(v / 1000) * 1000)], lcoh: ['ct/kWh', (v) => de(v, 1)],
        co2: ['t/a', (v) => de(v)], ren: ['%', (v) => de(v)], gas: ['MWh/a', (v) => de(v)], grid: ['MWh/a', (v) => de(v)]
      };
      const GROUPS = [['Kosten', ['invest', 'annual', 'lcoh']], ['Umwelt', ['co2', 'ren']], ['Energiebezug', ['gas', 'grid']]];
      const rows = [];
      GROUPS.forEach((g) => {
        rows.push({ isGroup: true, isMetric: false, isComps: false, isCompsHead: false, label: g[0], cells: [] });
        g[1].forEach((k) => {
          const m = byK[k];
          const vals = compared.map((i) => DATA[i].k[m.k]);
          const best = m.better === 'low' ? Math.min.apply(null, vals) : Math.max.apply(null, vals);
          const top = Math.max.apply(null, vals) || 1;
          rows.push({
            isGroup: false, isMetric: true, isComps: false, isCompsHead: false, label: m.label, unit: '(' + UNIT[k][0] + ')',
            cells: compared.map((i) => {
              const v = DATA[i].k[m.k];
              const isRef = i === ref;
              const isBest = v === best && compared.length > 1;
              const x = isRef ? { text: '', color: NEUTRAL } : delta(m, v, DATA[ref].k[m.k]);
              return {
                value: UNIT[k][1](v), best: isBest, weight: isBest ? 700 : 400, w: (v / top * 100).toFixed(1),
                bar: isBest ? '#1F567D' : '#7FA7C6', bg: isRef ? '#F3F7FC' : '#ffffff', delta: x.text, dColor: NEUTRAL /* grey: only the best value is marked */
              };
            })
          });
        });
        if (g[0] === 'Kosten') {
          // payback on operating costs, same basis as „Kumulierte Kosten“
          rows.push({
            isGroup: false, isMetric: true, isComps: false, isCompsHead: false, label: 'Amortisation', unit: 'gegenüber ' + RL,
            cells: compared.map((i) => {
              const d = DATA[i], R = DATA[ref];
              const dInv = d.k.invest - R.k.invest, dOp = d.opex - R.opex;
              let value = '–', sub = '';
              if (i !== ref) {
                if (dInv > 0 && dOp < 0) { const y = dInv / -dOp; value = y > 30 ? 'über 30 Jahre' : 'ca. ' + de(y) + ' Jahre'; sub = 'bis sich die Mehrinvestition rechnet'; }
                else if (dInv < 0 && dOp > 0) { const y = -dInv / dOp; value = y > 30 ? 'über 30 Jahre' : 'ca. ' + de(y) + ' Jahre'; sub = 'bis der Investitionsvorteil aufgebraucht ist'; }
                else if (dInv <= 0 && dOp <= 0) { value = 'sofort'; sub = 'günstiger in Investition und Betrieb'; }
                else { value = 'nie'; sub = 'teurer in Investition und Betrieb'; }
              }
              return { value: value, best: false, weight: 400, w: 0, bar: 'none', bg: i === ref ? '#F3F7FC' : '#ffffff', delta: sub, dColor: NEUTRAL };
            })
          });
        }
      });
      const compsOpen = !!st.compOpen;
      rows.push({ isGroup: false, isMetric: false, isComps: false, isCompsHead: true, label: compsOpen ? 'Komponenten ausblenden' : 'Komponenten anzeigen',
        openStr: compsOpen ? 'true' : 'false', rot: compsOpen ? 90 : 0, toggle: () => self.setState({ compOpen: !self.state.compOpen }), cells: [] });
      if (compsOpen) {
        rows.push({ isGroup: false, isMetric: false, isComps: true, isCompsHead: false, label: 'Komponenten',
          cells: scen.map((sc, k) => ({ groups: sc.groups, bg: compared[k] === ref ? '#F3F7FC' : '#ffffff' })) });
      }

      // trade-off scatter; all offered pairs are "lower is better" on both axes
      const PAIRS = [
        ['Kosten × CO₂', 'lcoh', 'co2'],
        ['Investition × Jahreskosten', 'invest', 'annual'],
        ['Strombezug × CO₂', 'grid', 'co2']
      ];
      const AX = {
        lcoh: { name: 'Kosten', title: 'Kosten (Energiegestehung, ct/kWh)', f: (v, step) => de(v, step < 1 ? 1 : 0), better: 'ist günstiger je kWh' },
        co2: { name: 'CO₂', title: 'CO₂ (t/a)', f: (v) => de(v), better: 'verursacht weniger CO₂' },
        invest: { name: 'Investition', title: 'Investition (Mio. €)', f: (v, step) => de(v / 1e6, step < 1e6 ? 1 : 0), better: 'braucht weniger Investition' },
        annual: { name: 'Jahreskosten', title: 'Jahreskosten (Tsd. €/a)', f: (v) => de(v / 1000), better: 'hat geringere Jahreskosten' },
        grid: { name: 'Strombezug', title: 'Strombezug (MWh/a)', f: (v) => de(v), better: 'bezieht weniger Strom aus dem Netz' }
      };
      const pi = st.pair || 0;
      const xk = PAIRS[pi][1], yk = PAIRS[pi][2];
      const scale = (vals) => {
        const mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals);
        const span = (mx - mn) || Math.abs(mx) || 1;
        const raw = span * 1.3 / 4;
        const pw = Math.pow(10, Math.floor(Math.log10(raw)));
        const f = raw / pw;
        const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pw;
        let lo = Math.floor((mn - span * 0.12) / step) * step;
        if (lo < 0 && mn >= 0) { lo = 0; }
        const t = [];
        for (let v = lo; v <= mx + span * 0.12 + step * 0.999 && t.length < 7; v += step) { t.push(v); }
        return { lo: lo, hi: t[t.length - 1], t: t, step: step };
      };
      const xs = compared.map((i) => DATA[i].k[xk]), ys = compared.map((i) => DATA[i].k[yk]);
      const SX = scale(xs), SY = scale(ys);
      const px = (v) => 80 + (v - SX.lo) / ((SX.hi - SX.lo) || 1) * 1020;
      const py = (v) => 330 - (v - SY.lo) / ((SY.hi - SY.lo) || 1) * 310;
      const sc = { xTitle: AX[xk].title, yTitle: AX[yk].title };
      for (let t = 0; t < 7; t += 1) {
        const xv = SX.t[t], yv = SY.t[t];
        sc['xt' + t] = xv == null ? { d: 'none', p: 0, t: '' } : { d: 'inline', p: px(xv).toFixed(1), t: AX[xk].f(xv, SX.step) };
        sc['yt' + t] = yv == null ? { d: 'none', p: 0, p5: 0, t: '' } : { d: 'inline', p: py(yv).toFixed(1), p5: (py(yv) + 5).toFixed(1), t: AX[yk].f(yv, SY.step) };
      }
      const dominators = (i) => compared.filter((j) => j !== i &&
        DATA[j].k[xk] <= DATA[i].k[xk] && DATA[j].k[yk] <= DATA[i].k[yk] &&
        (DATA[j].k[xk] < DATA[i].k[xk] || DATA[j].k[yk] < DATA[i].k[yk]));
      const front = compared.filter((i) => dominators(i).length === 0);
      for (let k = 0; k < 4; k += 1) {
        const i = compared[k];
        if (i == null) { sc['p' + k] = { d: 'none', x: 0, y: 0, ty: 0, lx: 0, anchor: 'start', ring: 'none', fill: 'none', stroke: 'none', fg: 'none', letter: '', short: '' }; continue; }
        const x = px(DATA[i].k[xk]), y = py(DATA[i].k[yk]);
        const dom = dominators(i).length > 0;
        const right = x > 840;
        sc['p' + k] = {
          d: 'inline', x: x.toFixed(1), y: y.toFixed(1), ty: (y + 5).toFixed(1),
          lx: (right ? x - 17 : x + 17).toFixed(1), anchor: right ? 'end' : 'start',
          ring: i === ref ? 'inline' : 'none',
          fill: '#1F567D', stroke: '#1F567D', fg: '#ffffff',
          letter: LETTERS[i], short: DATA[i].short
        };
      }
      // labels are HTML on top of the SVG (SVG text with placeholders does not render in the canvas)
      sc.xlabels = SX.t.map((v) => ({ left: (28 * 0 + px(v)).toFixed(1), text: AX[xk].f(v, SX.step) }));
      sc.ylabels = SY.t.map((v) => ({ top: (28 + py(v)).toFixed(1), text: AX[yk].f(v, SY.step) }));
      // point labels: try positions around each dot and take the first that collides with
      // no other dot, no label placed before and stays inside the plot (else the least overlap)
      if (!self._measure) {
        try { self._measure = document.createElement('canvas').getContext('2d'); } catch (err) { self._measure = null; }
      }
      const textW = (t) => {
        if (self._measure) { self._measure.font = '700 15px Lato, Arial, sans-serif'; return self._measure.measureText(t).width + 8; }
        return t.length * 8.6 + 8;
      };
      const pts = compared.map((i) => ({ i: i, x: px(DATA[i].k[xk]), y: py(DATA[i].k[yk]) }));
      const placed = [];
      const overlap = (a, b) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
      const PL = 80, PRT = PL + 1020, PT = 20, PB = 330;
      sc.plabels = pts.map((pt) => {
        const text = LETTERS[pt.i] + ' ' + DATA[pt.i].short;
        const w = textW(text), h = 22, g = 14;
        const cands = [
          [pt.x + g, pt.y - h / 2], [pt.x - g - w, pt.y - h / 2], [pt.x - w / 2, pt.y - g - h], [pt.x - w / 2, pt.y + g],
          [pt.x + 8, pt.y - 8 - h], [pt.x - 8 - w, pt.y - 8 - h], [pt.x + 8, pt.y + 8], [pt.x - 8 - w, pt.y + 8]
        ].map((c) => ({ l: c[0], t: c[1], r: c[0] + w, b: c[1] + h }));
        const dots = pts.map((o) => ({ l: o.x - 13, t: o.y - 13, r: o.x + 13, b: o.y + 13 }));
        // keep clear of the four corner texts of the crosshair
        const corners = [{ l: PL, t: 22, r: PL + 400, b: 46 }, { l: PRT - 400, t: 22, r: PRT, b: 46 }, { l: PL, t: 298, r: PL + 400, b: 322 }, { l: PRT - 400, t: 298, r: PRT, b: 322 }];
        dots.push.apply(dots, corners);
        const cost = (c) => {
          let k = placed.reduce((a, o) => a + overlap(c, o), 0) + dots.reduce((a, o) => a + overlap(c, o), 0);
          const out = Math.max(0, PL - c.l) + Math.max(0, c.r - PRT) + Math.max(0, PT - c.t) + Math.max(0, c.b - PB);
          return k + out * 50;
        };
        let best = cands[0], bestCost = Infinity;
        for (const c of cands) { const k = cost(c); if (k < bestCost) { best = c; bestCost = k; } if (k === 0) { break; } }
        placed.push(best);
        return { left: best.l.toFixed(1), top: (28 + best.t).toFixed(1), tx: '0', ty: '0', text: text };
      });
      // dashed crosshair through the reference scenario, with what each quarter means
      sc.cx = px(DATA[ref].k[xk]).toFixed(1);
      sc.cy = py(DATA[ref].k[yk]).toFixed(1);
      const WORDS = {
        lcoh: ['günstiger', 'teurer'], co2: ['weniger CO₂', 'mehr CO₂'], invest: ['weniger Investition', 'mehr Investition'],
        annual: ['geringere Jahreskosten', 'höhere Jahreskosten'], grid: ['weniger Strombezug', 'mehr Strombezug']
      };
      const wx = WORDS[xk], wy = WORDS[yk];
      sc.q = {
        tl: wx[0] + ', aber ' + wy[1] + ' als ' + RL, tr: wx[1] + ' und ' + wy[1] + ' als ' + RL,
        bl: wx[0] + ' und ' + wy[0] + ' als ' + RL, br: wx[1] + ', aber ' + wy[0] + ' als ' + RL
      };
      sc.list = compared.map((i) => {
        const dom = dominators(i).length > 0;
        return { letter: LETTERS[i], short: DATA[i].short + (i === ref ? ' (Bezug)' : ''), values: AX[xk].name + ' ' + byK[xk].fmt(DATA[i].k[xk]) + ' · ' + AX[yk].name + ' ' + byK[yk].fmt(DATA[i].k[yk]),
          fill: dom ? '#E3EAEE' : '#1F567D', stroke: dom ? '#A8B5C0' : '#1F567D', fg: dom ? '#495965' : '#ffffff' };
      });
      const L = (i) => LETTERS[i];
      if (front.length === 1) {
        sc.headline = L(front[0]) + ' ist in beiden Größen am besten.';
      } else if (front.length === 2) {
        const bx = front.slice().sort((a, b) => DATA[a].k[xk] - DATA[b].k[xk])[0];
        const by = front.filter((i) => i !== bx)[0];
        sc.headline = 'Zielkonflikt zwischen ' + L(bx) + ' und ' + L(by) + ': ' + L(bx) + ' ' + AX[xk].better + ', ' + L(by) + ' ' + AX[yk].better + '.';
      } else {
        sc.headline = 'Zielkonflikt zwischen ' + front.map(L).join(', ') + ': keines ist in beiden Größen besser als ein anderes.';
      }
      sc.notes = compared.filter((i) => dominators(i).length > 0).map((i) => {
        const by = dominators(i);
        return { text: L(i) + ' wird von ' + by.map(L).join(' und ') + ' in beiden Größen übertroffen. In dieser Abwägung spricht wenig für ' + L(i) + '.' };
      });
      sc.aria = 'Streudiagramm ' + AX[xk].title + ' gegen ' + AX[yk].title + '. ' +
        compared.map((i) => L(i) + ' ' + DATA[i].short + ': ' + byK[xk].fmt(DATA[i].k[xk]) + ', ' + byK[yk].fmt(DATA[i].k[yk])).join('; ') + '. ' + sc.headline;


      // ---------- comparison versions of „Energie“ and „Kosten“ ----------
      const LAB = (i) => DATA[i].short + (i === ref ? ' (Bezug)' : '');
      const tableFor = (id, cols, trows) => {
        const open = !!st.tables[id];
        return {
          hasTable: true, tableId: 'table-' + id, tableOpen: open, tableOpenStr: open ? 'true' : 'false',
          tableLabel: open ? 'Tabelle ausblenden' : 'Tabelle anzeigen', tableRot: open ? 90 : 0,
          toggleTable: () => self.setState({ tables: Object.assign({}, self.state.tables, { [id]: !self.state.tables[id] }) }),
          gridCols: 'minmax(0, 2fr) repeat(' + (cols.length - 1) + ', minmax(0, 1fr))',
          tcols: cols.map((c, ci) => ({ text: c, align: ci === 0 ? 'left' : 'right' })),
          trows: trows.map((r) => ({ cells: r.map((c, ci) => ({ role: ci === 0 ? 'rowheader' : 'cell', text: c, align: ci === 0 ? 'left' : 'right', weight: ci === 0 ? 700 : 400, color: ci === 0 ? '#343434' : '#495965' })) }))
        };
      };
      const blank = { hasNote: false, note: '', hasLegend: false, legend: [], isBars: false, isMultiples: false, isWaterfall: false, isLines: false, isSame: false, hasTable: false, sep: '' };
      // stacked bars, one row per scenario, via the shared chart() helper
      const barsItem = (id, title, note, unit, series, valuesOf, decimals) => {
        const c = self.chart({ kind: 'hbar', title: title, labelHead: 'Szenario', decimals: decimals,
          data: { unit: unit, series: series, rows: compared.map((i) => ({ label: LETTERS[i] + ' · ' + LAB(i), values: valuesOf(i) })) } });
        return Object.assign({}, blank, {
          key: id, title: title, hasNote: !!note, note: note || '', isBars: true, aria: c.aria,
          hasLegend: true, legend: series.map((x) => ({ name: x.name, color: x.color })),
          bars: c.hrows.map((r, k) => ({ letter: LETTERS[compared[k]], label: LAB(compared[k]), weight: compared[k] === ref ? 700 : 400, valueText: r.valueText, segs: r.segs }))
        }, tableFor('cmp-' + id, c.table.cols, c.table.rows));
      };
      const deFmt = (v, dec) => de(v, dec);
      const eur = (v) => de(Math.round(v / 1000) * 1000) + ' €/a';
      const signed = (v, f) => (v > 0 ? '+' : v < 0 ? '−' : '±') + f(Math.abs(v));

      // Energie
      const MIX_SERIES = [
        { name: 'Fluss-Wärmepumpe', color: '#2B7FBF' }, { name: 'Luft-Wärmepumpe', color: '#9FCDEC' },
        { name: 'Industrielle Abwärme', color: '#62AE6E' }, { name: 'Biomasse-BHKW', color: '#B85C14' }, { name: 'Gaskessel', color: '#5C6670' }
      ];
      const mixItem = barsItem('mix', 'Wärmebereitstellung je Szenario', 'Szenarien mit Wärmenetz erzeugen mehr als den Bedarf von 1.100 MWh/a, weil Netzverluste hinzukommen.', 'MWh/a', MIX_SERIES, (i) => DATA[i].mix);

      const W = [0.16, 0.14, 0.12, 0.08, 0.05, 0.03, 0.03, 0.03, 0.05, 0.08, 0.11, 0.12];
      const W2s = W.reduce((a, w) => a + w * w, 0);
      const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
      const monthly = (i) => W.map((w) => ({ e: DATA[i].el * w, g: DATA[i].gas * w * w / W2s }));
      const mMax = Math.max.apply(null, compared.map((i) => Math.max.apply(null, monthly(i).map((m) => m.e + m.g)))) || 1;
      const yTop = Math.ceil(mMax / 20) * 20;
      const bezugItem = Object.assign({}, blank, {
        key: 'bezug', title: 'Strom- und Gasbezug je Monat', hasNote: true,
        note: 'Gleiche Skala in allen Diagrammen, damit die Höhen vergleichbar sind.',
        hasLegend: true, legend: [{ name: 'Strom aus dem Netz', color: '#1F567D' }, { name: 'Erdgas', color: '#5C6670' }],
        isMultiples: true, cols: 'repeat(' + compared.length + ', minmax(0, 1fr))',
        panels: compared.map((i) => {
          const ms = monthly(i);
          const peak = ms.reduce((b, m, k) => (m.e + m.g > ms[b].e + ms[b].g ? k : b), 0);
          return {
            letter: LETTERS[i], short: LAB(i), border: i === ref ? '#1F567D' : '#E3EAEE', maxText: de(yTop) + ' MWh',
            months: ms.map((m, k) => ({ l: MONTHS[k][0], e: (m.e / yTop * 100).toFixed(1), g: (m.g / yTop * 100).toFixed(1),
              title: MONTHS[k] + ': Strom ' + de(m.e) + ' MWh, Erdgas ' + de(m.g) + ' MWh' })),
            total: 'Strom ' + de(DATA[i].el) + ' · Erdgas ' + de(DATA[i].gas) + ' MWh/a',
            aria: 'Szenario ' + LETTERS[i] + ', ' + DATA[i].short + ': Strom ' + de(DATA[i].el) + ' MWh/a, Erdgas ' + de(DATA[i].gas) + ' MWh/a, am höchsten im ' + ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'][peak] + '.'
          };
        })
      }, tableFor('cmp-bezug', ['Szenario und Energieträger'].concat(MONTHS).concat(['Jahr']),
        compared.reduce((acc, i) => acc.concat([
          [LETTERS[i] + ' Strom (MWh)'].concat(monthly(i).map((m) => de(m.e))).concat([de(DATA[i].el)]),
          [LETTERS[i] + ' Erdgas (MWh)'].concat(monthly(i).map((m) => de(m.g))).concat([de(DATA[i].gas)])
        ]), [])));

      const sameItem = Object.assign({}, blank, {
        key: 'same', title: 'Wärmebedarf', isSame: true,
        sameText: 'In allen Szenarien gleich: 1.100 MWh/a, gleiche Zeitreihe und Lastdauerlinie. Deshalb hier kein Vergleich. Die Diagramme findest du in der Einzelansicht von ' + RL + '.',
        // switch to the single view of the reference scenario and land on the heat-demand time series
        openSingle: (e) => {
          const box = e.currentTarget.closest('#results-scroll');
          self.setState({ compare: false, menu: null, section: 'energy', flash: 'timeseries',
            collapsed: Object.assign({}, self.state.collapsed, { timeseries: false }),
            announce: 'Einzelansicht von Szenario ' + RL + ', Abschnitt Energie, Zeitreihen.' });
          setTimeout(() => {
            const root = box && box.isConnected ? box : (box && box.ownerDocument.getElementById('results-scroll'));
            const el = root && root.querySelector('#sub-timeseries');
            if (el) {
              const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
              root.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop - 76), behavior: still ? 'auto' : 'smooth' });
            }
          }, 60);
          setTimeout(() => { if (self.state.flash === 'timeseries') { self.setState({ flash: null }); } }, 1800);
        }
      });

      // Kosten
      const COST_SERIES = [{ name: 'Kapitalkosten (Annuität)', color: '#1F567D' }, { name: 'Betrieb und Wartung', color: '#4A90C4' }, { name: 'Energie- und Brennstoffbezug', color: '#A9CDE8' }];
      const annualItem = barsItem('annual', 'Jährliche Kosten nach Kostenart', '', '€/a', COST_SERIES, (i) => DATA[i].cost);

      const others = compared.filter((i) => i !== ref);
      const target = others.indexOf(st.cmpTarget) !== -1 ? st.cmpTarget : (others.length ? others[0] : ref);
      const R2 = DATA[ref], T2 = DATA[target];
      const parts = COST_SERIES.map((c, k) => ({ name: c.name, d: T2.cost[k] - R2.cost[k] }));
      const t0 = R2.k.annual, t1 = T2.k.annual;
      let run = t0;
      const wfMax = Math.max(t0, t1, parts.reduce((m, p) => { run += p.d; return Math.max(m, run); }, t0)) * 1.12;
      run = t0;
      const pct = (v) => (v / wfMax * 100).toFixed(2);
      const wcols = [{ label: RL + ' gesamt', lo: 0, hi: t0, color: '#1F567D', value: eur(t0), textColor: '#343434', weight: 700 }]
        .concat(parts.map((p) => {
          const lo = Math.min(run, run + p.d), hi = Math.max(run, run + p.d);
          run += p.d;
          const up = p.d > 0;
          return { label: p.name.replace(' (Annuität)', ''), lo: lo, hi: hi, color: Math.abs(p.d) < 1 ? '#A8B5C0' : (up ? BAD : GOOD), value: signed(p.d, eur), textColor: Math.abs(p.d) < 1 ? NEUTRAL : (up ? BAD : GOOD), weight: 400 };
        }))
        .concat([{ label: LETTERS[target] + ' gesamt', lo: 0, hi: t1, color: '#1F567D', value: eur(t1), textColor: '#343434', weight: 700 }])
        .map((c) => ({ label: c.label, lo: pct(c.lo), h: pct(c.hi - c.lo), top: pct(c.hi), color: c.color, value: c.value, textColor: c.textColor, weight: c.weight }));
      const ups = parts.filter((p) => p.d > 0).sort((a, b) => b.d - a.d), downs = parts.filter((p) => p.d < 0).sort((a, b) => a.d - b.d);
      const nm = (p) => p.name.replace(' (Annuität)', '');
      const dTot = t1 - t0;
      const T = LETTERS[target];
      let summary = T + ' hat ' + eur(Math.abs(dTot)) + (dTot < 0 ? ' geringere' : ' höhere') + ' Jahreskosten als ' + RL + '.';
      if (dTot < 0 && ups.length && downs.length) { summary += ' Höhere ' + nm(ups[0]) + ' (' + signed(ups[0].d, eur) + ') werden durch geringere ' + nm(downs[0]) + ' (' + signed(downs[0].d, eur) + ') mehr als ausgeglichen.'; }
      else if (dTot > 0 && ups.length && downs.length) { summary += ' Geringere ' + nm(downs[0]) + ' (' + signed(downs[0].d, eur) + ') gleichen höhere ' + nm(ups[0]) + ' (' + signed(ups[0].d, eur) + ') nicht aus.'; }
      else if (ups.length || downs.length) { const big = (dTot < 0 ? downs : ups)[0]; summary += ' Größter Posten: ' + nm(big) + ' (' + signed(big.d, eur) + ').'; }
      const wfItem = Object.assign({}, blank, {
        key: 'wf', title: 'Woher der Unterschied bei den Jahreskosten kommt', isWaterfall: true,
        wf: {
          from: 'Von ' + RL + ' (Bezug) zu', summary: summary,
          aria: 'Wasserfalldiagramm von ' + RL + ' zu ' + T + ': ' + RL + ' ' + eur(t0) + '; ' + parts.map((p) => nm(p) + ' ' + signed(p.d, eur)).join('; ') + '; ' + T + ' ' + eur(t1) + '.',
          cols: wcols,
          targets: others.map((i, k) => ({ label: LETTERS[i] + ' · ' + DATA[i].short, on: i === target ? 'true' : 'false', bg: i === target ? '#1F567D' : '#ffffff', fg: i === target ? '#ffffff' : '#495965', sep: k === 0 ? '0' : '1px solid #D6D6D6', pick: () => self.setState({ cmpTarget: i }) }))
        }
      }, tableFor('cmp-wf', ['Kostenart', RL + ' (Bezug)', T, 'Differenz'],
        COST_SERIES.map((c, k) => [c.name, eur(R2.cost[k]), eur(T2.cost[k]), signed(T2.cost[k] - R2.cost[k], eur)])
          .concat([['Gesamt', eur(t0), eur(t1), signed(dTot, eur)]])));

      const INV_SERIES = [
        { name: 'Fluss-Wärmepumpe', color: '#2B7FBF' }, { name: 'Luft-Wärmepumpe', color: '#9FCDEC' }, { name: 'Industrielle Abwärme', color: '#62AE6E' },
        { name: 'Biomasse-BHKW', color: '#B85C14' }, { name: 'Gaskessel', color: '#5C6670' }, { name: 'Pufferspeicher', color: '#7E5BB0' }, { name: 'Wärmenetz', color: '#17405C' }
      ];
      const invItem = barsItem('invest', 'Investitionskosten nach Anlage', 'D: Luft-Wärmepumpen in 86 Gebäuden statt zentraler Anlagen und Wärmenetz.', '€', INV_SERIES, (i) => DATA[i].inv.map((v) => v * 1e6));
      if (!compared.some((i) => !DATA[i].network)) { invItem.hasNote = false; }

      // cumulative costs: investment in year 0 plus operating costs per year (simplified)
      const YM = 12e6;
      const X = (t) => 70 + t / 20 * 930, Y = (v) => 260 - v / YM * 240;
      const DASH = ['', '10 6', '3 5', '14 5 3 5'];
      const order = compared.slice();
      const ends = order.map((i) => ({ i: i, y: Y(DATA[i].k.invest + DATA[i].opex * 20) }));
      ends.sort((a, b) => a.y - b.y);
      for (let k = 1; k < ends.length; k += 1) { if (ends[k].y - ends[k - 1].y < 18) { ends[k].y = ends[k - 1].y + 18; } }
      const endY = {};
      ends.forEach((e) => { endY[e.i] = e.y; });
      const ln = { legend: [] };
      for (let k = 0; k < 4; k += 1) { ln['y' + k] = ''; }
      for (let k = 0; k < 7; k += 1) { ln['y' + k] = de(k * 2) + ' Mio. €'; }
      ln.y0 = '0';
      for (let k = 0; k < 4; k += 1) {
        const i = order[k];
        if (i == null) { ln['l' + k] = { d: 'M0 0', stroke: 'none', w: 0, dash: '', ly: -10, top: -50, letter: '' }; continue; }
        const isR = i === ref;
        const st2 = { stroke: isR ? '#1F567D' : '#495965', w: isR ? 3.5 : 2, dash: isR ? '' : DASH[(k % 3) + 1] };
        ln['l' + k] = Object.assign({ d: 'M' + X(0).toFixed(1) + ' ' + Y(DATA[i].k.invest).toFixed(1) + ' L' + X(20).toFixed(1) + ' ' + Y(DATA[i].k.invest + DATA[i].opex * 20).toFixed(1), ly: (endY[i] + 5).toFixed(1), top: endY[i].toFixed(1), letter: LETTERS[i] }, st2);
        ln.legend.push(Object.assign({ letter: LETTERS[i], short: LAB(i) }, st2));
      }
      const crossTexts = [];
      for (let k = 0; k < 3; k += 1) { ln['c' + k] = { d: 'none', x: 0, y: 0, ty: 0, t: '' }; }
      let ci = 0;
      others.forEach((i) => {
        const a = DATA[ref], b = DATA[i];
        const dOp = a.opex - b.opex, dIn = b.k.invest - a.k.invest;
        if (dOp === 0) { return; }
        const t = dIn / dOp;
        if (t > 0 && t <= 20) {
          const later = dIn > 0 ? LETTERS[i] : RL;
          const v = a.k.invest + a.opex * t;
          crossTexts.push(later + ' ist ab Jahr ' + de(Math.ceil(t)) + ' insgesamt günstiger' + (dIn > 0 ? ' als ' + RL : ' als ' + LETTERS[i]));
          if (ci < 3) { ln['c' + ci] = { d: 'inline', x: X(t).toFixed(1), y: Y(v).toFixed(1), ty: (Y(v) - 18).toFixed(1), t: LETTERS[i] + ' = ' + RL + ' · Jahr ' + de(Math.ceil(t)) }; ci += 1; }
        }
      });
      ln.aria = 'Kumulierte Kosten über 20 Jahre: ' + order.map((i) => LETTERS[i] + ' von ' + money(DATA[i].k.invest) + ' auf ' + money(DATA[i].k.invest + DATA[i].opex * 20)).join('; ') + '. ' + crossTexts.join('. ') + '.';
      const linesItem = Object.assign({}, blank, {
        key: 'cum', title: 'Kumulierte Kosten über 20 Jahre', isLines: true, ln: ln, hasNote: true,
        note: (crossTexts.length ? crossTexts.join('. ') + '. ' : '') + 'Vereinfacht: Investition im Jahr 0 plus jährliche Betriebs- und Energiekosten, ohne Zinsen, Preissteigerungen und Ersatzinvestitionen.'
      }, tableFor('cmp-cum', ['Jahr'].concat(order.map((i) => LETTERS[i] + ' · ' + DATA[i].short)),
        [0, 5, 10, 15, 20].map((t) => [String(t)].concat(order.map((i) => money(DATA[i].k.invest + DATA[i].opex * t))))));

      const SEP = 'border-top: 1px solid #E3EAEE; padding-top: 24px';
      const subOf = (id, title, items) => {
        const open = !st.collapsed['cmp-' + id];
        return {
          title: title, open: open, openStr: open ? 'true' : 'false', rot: open ? 90 : 0, bodyId: 'cmp-body-' + id,
          toggle: () => self.setState({ collapsed: Object.assign({}, self.state.collapsed, { ['cmp-' + id]: open }) }),
          items: items.map((it, k) => {
            const key = 'cmp-menu-' + it.key;
            const on = st.menu === key;
            return Object.assign({}, it, {
              sep: k === 0 ? '' : SEP,
              hasMenu: !it.isSame, menuOpen: on, menuStr: on ? 'true' : 'false', menuBg: on ? '#F4F7F9' : 'transparent',
              menuTop: k === 0 ? '38px' : '62px', menuLabel: 'Optionen für ' + it.title, csvLabel: 'Daten von „' + it.title + '“ als CSV herunterladen',
              toggleMenu: () => self.setState({ menu: self.state.menu === key ? null : key })
            });
          })
        };
      };
      const secs = [
        { id: 'energy', title: 'Energie', subs: [
          subOf('mix', 'Energiemix', [mixItem]),
          subOf('bezug', 'Bezug von außen', [bezugItem]),
          subOf('same', 'Unverändert', [sameItem])
        ] },
        { id: 'costs', title: 'Kosten', subs: [
          subOf('annual', 'Jährliche Kosten', [annualItem, wfItem]),
          subOf('invest', 'Investition', [invItem]),
          subOf('cum', 'Kosten über die Zeit', [linesItem])
        ] }
      ];
      return {
        secs: st.compare && compared.length > 1 ? secs : [],
        showSecs: st.compare && compared.length > 1,
        single: compared.length < 2, multi: compared.length > 1,
        refLetter: RL, showHint: compared.length > 1 && st.cmpHint,
        hideHint: () => self.setState({ cmpHint: false, announce: 'Hinweis ausgeblendet.' }),
        scen: scen,
        stripCols: 'repeat(' + compared.length + ', minmax(0, 1fr))',
        gridCols: 'minmax(200px, 1.1fr) repeat(' + compared.length + ', minmax(0, 1fr))',
        heads: compared.map((i, k) => ({ letter: LETTERS[i], short: DATA[i].short, isRef: i === ref, notRef: i !== ref, bg: i === ref ? '#E6F0F8' : '#F4F7F9', makeRef: scen[k].makeRef, refLabel: scen[k].refLabel })),
        rows: rows,
        pairs: PAIRS.map((p, k) => ({
          label: p[0], on: k === pi ? 'true' : 'false', bg: k === pi ? '#1F567D' : '#ffffff', fg: k === pi ? '#ffffff' : '#495965',
          sep: k === 0 ? '0' : '1px solid #D6D6D6', pick: () => self.setState({ pair: k })
        })),
        sc: sc
      };
    })();

    // values for the full filter bar (in the page) and the compact pinned bar (overlay)
    const barVals = (scr) => ({
      expanded: !scr,
      barPad: scr ? '0 64px' : '16px 64px 0',
      barAlign: scr ? 'center' : 'flex-end',
      barRowGap: scr ? '0' : '14px',
      ctrlH: scr ? '36px' : '44px',
      scenarioW: scr ? '300px' : '420px',
      scenarioMenuTop: scr ? '42px' : '76px',
      togglePad: scr ? '0 12px' : '0 16px',
      singleLabel: scr ? 'Einzeln' : 'Einzelnes Szenario',
      compareLabel: scr ? 'Vergleich' : 'Szenarienvergleich',
      exportOrder: scr ? 2 : 0,
      exportPad: scr ? '0 10px' : '0 16px',
      exportMenuTop: scr ? '42px' : '50px',
      exportHasLabel: !scr || st.compare,
      navOrder: scr ? 1 : 0,
      navFlex: scr ? '1 1 auto' : '1 0 100%',
      navMargin: scr ? '8px' : '0',
      tabH: scr ? '52px' : '44px',
      tabPadX: scr ? '10px' : '14px',
      tabFont: scr ? '14px' : '15px',
      exportLabelShown: scr ? '(' + n + ')' : (st.compare ? 'Herunterladen (' + n + ')' : 'Herunterladen')
    });

    return {
      showNotice: st.notice,
      hideNotice: () => self.setState({ notice: false }),
      project: PROJECTS[st.project],
      projects: projects,
      scenarios: scenarios,
      compare: st.compare,
      compareStr: st.compare ? 'true' : 'false',
      singleStr: st.compare ? 'false' : 'true',
      scenarioLabel: st.compare ? 'Szenarien' : 'Szenario',
      scenarioText: st.compare ? (n === 1 ? SCENARIOS[compared[0]] + ' – weitere wählen' : n + ' Szenarien ausgewählt') : SCENARIOS[st.scenario],
      stepScenario: SCENARIOS[st.scenario],
      full: barVals(false),
      pin: barVals(true),
      pinned: st.scrolled,
      scrollbarW: st.sbw || 0,
      onScroll: (e) => {
        const box = e.currentTarget;
        const top = box.scrollTop;
        let current = 'overview';
        SECTIONS.forEach((sec) => {
          const h = box.querySelector('#' + sec[0]);
          if (h && h.offsetTop - 110 <= top) { current = sec[0]; }
        });
        // the compact bar appears once the full filter bar has scrolled out of view (the full bar never changes size)
        const bar = box.querySelector('#filter-bar');
        const scrolled = bar ? top > bar.offsetTop + bar.offsetHeight - 52 : top > 120;
        const sbw = box.offsetWidth - box.clientWidth;
        if (current !== self.state.section || scrolled !== self.state.scrolled || sbw !== self.state.sbw) {
          self.setState({ section: current, scrolled: scrolled, sbw: sbw });
        }
      },
      singleBg: st.compare ? '#ffffff' : '#1F567D', singleFg: st.compare ? '#495965' : '#ffffff',
      compareBg: st.compare ? '#1F567D' : '#ffffff', compareFg: st.compare ? '#ffffff' : '#495965',
      showSingle: () => self.setState({ compare: false, menu: null }),
      showCompare: () => self.setState({ compare: true, menu: null, compared: compared }),
      projectOpen: st.menu === 'project', projectOpenStr: st.menu === 'project' ? 'true' : 'false',
      scenarioOpen: st.menu === 'scenario', scenarioOpenStr: st.menu === 'scenario' ? 'true' : 'false',
      exportOpen: st.menu === 'export', exportOpenStr: st.menu === 'export' ? 'true' : 'false',
      projectBg: st.menu === 'project' ? '#F3F7FC' : '#ffffff',
      scenarioBg: st.menu === 'scenario' ? '#F3F7FC' : '#ffffff',
      anyOpen: st.menu !== null,
      toggleProject: toggle('project'),
      toggleScenario: toggle('scenario'),
      toggleExport: toggle('export'),
      closeMenus: () => self.setState({ menu: null }),
      exportScope: st.compare ? 'Für die ' + n + ' ausgewählten Szenarien' : 'Für ' + SCENARIOS[st.scenario],
      exports: [
        { label: 'Zeitreihen', hint: st.compare ? 'Alle Zeitreihen, je Szenario' : 'Alle Zeitreihen des Szenarios' },
        { label: 'KPIs', hint: st.compare ? 'Kennzahlen im Vergleich' : 'Kennzahlen der Zusammenfassung' },
        { label: 'Komponentenkosten', hint: st.compare ? 'Kosten je Komponente und Szenario' : 'Kosten je Komponente' }
      ],
      sections: visibleSections.map((s) => {
        const on = activeSection === s[0];
        return {
          labelFull: st.compare && s[0] === 'overview' ? 'Vergleich auf einen Blick' : s[1],
          labelShort: st.compare && s[0] === 'overview' ? 'Vergleich' : s[2],
          full: st.compare && s[0] === 'overview' ? 'Vergleich auf einen Blick' : s[1], href: '#' + s[0], current: on ? 'location' : 'false',
          line: on ? '#1F567D' : 'transparent', color: on ? '#343434' : '#495965',
          go: (e) => { self.setState({ section: s[0] }); jump(e, s[0]); }
        };
      }),
      // in comparison mode „Vergleich auf einen Blick“ replaces the single-scenario overview
      content: content.filter((sec) => sec.subs.length > 0 && !st.compare).map((sec) => Object.assign({}, sec, {
        cmpNote: st.compare && n > 1, refText: LETTERS[st.scenario] + ' (' + SCENARIOS[st.scenario] + ')'
      })),
      cmp: cmp,
      announce: st.announce,
      // Escape closes the innermost open layer: tooltip, then menu.
      // Focus goes back to the button that opened the menu.
      onKey: (e) => {
        if (e.key !== 'Escape') { return; }
        const s2 = self.state;
        if (s2.tip) { self.setState({ tip: null }); return; }
        if (s2.menu) {
          const opener = e.target.closest('[role="menu"], [role="listbox"]');
          self.setState({ menu: null });
          const host = opener && opener.parentElement;
          const btn = host && host.querySelector('[aria-haspopup][aria-expanded="true"]');
          if (btn) { setTimeout(() => btn.focus(), 0); }
          return;
        }
      }
    };
  }
}


/* ==========================================================================================
   3. TEMPLATES
   ------------------------------------------------------------------------------------------
   Each function returns HTML for one part of the page, from the view model in part 2.
   Static styling lives in results.scss (BEM classes). Only values that come from the data
   (bar widths, series colours, chart coordinates) are written as inline styles.
   on(fn, key) registers a click handler (see part 4); key keeps the focus on that control
   after the page is redrawn.
   ========================================================================================== */

var ICON = {
  chevronDown: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"></path></svg>',
  chevronRight: '<svg class="r-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"></path></svg>',
  chevronSmall: '<svg class="r-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"></path></svg>',
  check: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"></path></svg>',
  checkBox: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"></path></svg>',
  checkBest: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"></path></svg>',
  info: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 11v5M12 8h.01"></path></svg>',
  infoSmall: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 11v5M12 8h.01"></path></svg>',
  download: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"></path></svg>',
  downloadSmall: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"></path></svg>',
  scenario: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19V5M4 19h16M8 15l4-4 3 3 5-6"></path></svg>',
  plus: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>',
  plusItem: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>',
  more: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.8"></circle><circle cx="12" cy="12" r="1.8"></circle><circle cx="12" cy="19" r="1.8"></circle></svg>',
  csv: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><path d="M14 3v6h6M8 13h8M8 17h8"></path></svg>',
  hide: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"></path><path d="M10.6 5.1A10 10 0 0 1 12 5c5 0 9 4.5 10 7a13 13 0 0 1-3 4.2M6.6 6.6C4.3 8 2.7 10.2 2 12c1 2.5 5 7 10 7a9.6 9.6 0 0 0 5.4-1.6"></path><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"></path></svg>',
  close: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg>',
  noData: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h16M7 16V9M12 16V5M17 16v-3"></path><path d="M3 3l18 18"></path></svg>',
  same: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M5 9h14M5 15h14"></path></svg>'
};

var esc = function (value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c];
  });
};
var map = function (list, fn) { return (list || []).map(fn).join(""); };
// Note: both arguments are evaluated; use a ternary when the HTML needs data that may be missing
var when = function (cond, html) { return cond ? html : ""; };

/* ---------- header ---------- */

// Development notice and project title (scrolls away)
var tplTop = function (v) {
  return when(v.showNotice,
    '<div class="r-notice" role="note">' + ICON.info +
      '<span>Das Tool ist noch in Entwicklung, Ergebnisse können sich ändern. Mehr zu den Methoden in der ' +
      '<a class="r-notice__link" href="#">Dokumentation</a>.</span>' +
      '<button type="button" class="r-notice__dismiss"' + on(v.hideNotice, "notice") + '>Nicht mehr anzeigen</button>' +
    '</div>') +
    '<div class="r-title">' +
      '<div class="r-title__inner">' +
        '<div class="r-title__label">Projekt</div>' +
        '<button type="button" class="r-title__toggle" aria-haspopup="listbox" aria-expanded="' + v.projectOpenStr + '" title="Projekt wechseln"' + on(v.toggleProject, "project") + '>' +
          '<span>' + esc(v.project) + '</span>' + ICON.chevronDown.replace('width="14" height="14"', 'width="18" height="18"') +
        '</button>' +
        when(v.projectOpen,
          '<div class="r-menu r-menu--project" role="listbox">' +
            map(v.projects, function (p, i) {
              return '<button type="button" role="option" class="r-menu__option" aria-selected="' + p.selStr + '"' + on(p.pick, "project-" + i) + '>' +
                '<span>' + esc(p.name) + '</span>' + when(p.selected, '<span class="r-menu__check">' + ICON.check + '</span>') + '</button>';
            }) +
          '</div>') +
      '</div>' +
    '</div>';
};

// Filter bar. compact = the bar pinned at the top while scrolling (short labels, one row)
var tplBar = function (v, compact) {
  var b = compact ? v.pin : v.full;
  var k = compact ? "pin-" : "";
  var scenarioMenu = v.scenarioOpen && compact === v.pinned ? (
    '<div class="r-menu r-menu--scenario" role="listbox" aria-multiselectable="' + v.compareStr + '">' +
      when(v.compare, '<div class="r-menu__head">Szenarien zum Vergleich wählen</div>') +
      map(v.scenarios, function (s, i) {
        return '<button type="button" role="option" class="r-menu__option" aria-selected="' + s.selStr + '"' + on(s.pick, k + "scenario-" + i) + '>' +
          when(v.compare, '<span class="r-menu__box" aria-hidden="true">' + ICON.checkBox + '</span>') +
          '<span class="r-menu__grow">' + esc(s.name) + '</span>' +
          when(s.isCurrent, '<span class="r-menu__meta">Bezug</span>') +
          when(s.showCheck, '<span class="r-menu__check">' + ICON.check + '</span>') +
        '</button>';
      }) +
      '<div class="r-menu__foot">Szenarien dieses Projekts mit abgeschlossener Simulation</div>' +
    '</div>') : "";
  var exportMenu = v.exportOpen && compact === v.pinned ? (
    '<div class="r-menu r-menu--export" role="menu">' +
      '<div class="r-menu__head">' + esc(v.exportScope) + '</div>' +
      map(v.exports, function (x, i) {
        return '<button type="button" role="menuitem" class="r-menu__item r-menu__item--rich"' + on(v.closeMenus, k + "export-" + i) + '>' +
          '<span class="r-menu__icon">' + ICON.downloadSmall + '</span>' +
          '<span class="r-menu__text"><strong>' + esc(x.label) + '</strong><span>' + esc(x.hint) + '</span></span></button>';
      }) +
    '</div>') : "";
  return '<div class="r-bar' + (compact ? " r-bar--compact" : "") + '">' +
    '<div class="r-bar__inner">' +
      '<div class="r-bar__field">' +
        when(b.expanded, '<div class="r-bar__label">' + esc(v.scenarioLabel) + '</div>') +
        '<button type="button" class="r-bar__select" aria-haspopup="listbox" aria-expanded="' + v.scenarioOpenStr + '" aria-label="' + esc(v.scenarioLabel) + '"' + on(v.toggleScenario, k + "scenario") + '>' +
          '<span class="r-bar__select-text">' + ICON.scenario + '<span>' + esc(v.scenarioText) + '</span></span>' + ICON.chevronDown +
        '</button>' +
        scenarioMenu +
      '</div>' +
      // View switch: two pages, so two links (in the app: project_visualize_results / project_compare_results)
      '<nav class="r-bar__view" aria-label="Ansicht">' +
        '<a class="r-bar__view-link" href="single.html"' + (v.compare ? "" : ' aria-current="page"') + '>' + esc(b.singleLabel) + '</a>' +
        '<a class="r-bar__view-link" href="compare.html"' + (v.compare ? ' aria-current="page"' : "") + '>' + esc(b.compareLabel) + '</a>' +
      '</nav>' +
      '<div class="r-bar__export">' +
        '<button type="button" class="r-bar__export-btn" aria-haspopup="menu" aria-expanded="' + v.exportOpenStr + '" title="Herunterladen"' + on(v.toggleExport, k + "export") + '>' +
          ICON.download + when(b.exportHasLabel, '<span>' + esc(b.exportLabelShown) + '</span>') + ICON.chevronDown.replace('width="14" height="14"', 'width="12" height="12"') +
        '</button>' +
        exportMenu +
      '</div>' +
      '<div class="r-bar__nav">' +
        '<nav class="r-bar__tabs" aria-label="Abschnitte" data-r-tabs>' +
          map(v.sections, function (s) {
            return '<a class="r-bar__tab" href="' + s.href + '" data-r-jump="' + s.href.slice(1) + '"' + (s.current === "location" ? ' aria-current="location"' : "") + ' title="' + esc(s.full) + '">' +
              esc(compact ? s.labelShort : s.labelFull) + '</a>';
          }) +
        '</nav>' +
      '</div>' +
    '</div>' +
  '</div>';
};

/* ---------- shared parts of charts ---------- */

var tplLegend = function (legend) {
  return '<div class="r-legend" aria-hidden="true">' + map(legend, function (lg) {
    return '<span class="r-legend__item"><span class="r-legend__swatch" style="background: ' + lg.color + '"></span>' + esc(lg.name) + '</span>';
  }) + '</div>';
};

// "Tabelle anzeigen" under a chart, and the table itself (real <table> for screen readers)
var tplTable = function (it, key) {
  return '<div class="r-table">' +
    '<button type="button" class="r-table__toggle" aria-expanded="' + it.tableOpenStr + '" aria-controls="' + it.tableId + '"' + on(it.toggleTable, key + "-table") + '>' +
      ICON.chevronSmall + esc(it.tableLabel) + '</button>' +
    when(it.tableOpen,
      '<div class="r-table__wrap" id="' + it.tableId + '"><table class="r-table__table"><caption class="r-sr-only">' + esc(it.title) + '</caption><thead><tr>' +
        map(it.tcols || it.cols, function (c) { return '<th scope="col"' + (c.align === "right" ? ' class="is-num"' : "") + '>' + esc(c.text) + '</th>'; }) +
      '</tr></thead><tbody>' +
        map(it.trows || it.rows, function (r) {
          return '<tr>' + map(r.cells, function (c, ci) {
            return ci === 0 ? '<th scope="row">' + esc(c.text) + '</th>' : '<td class="is-num">' + esc(c.text) + '</td>';
          }) + '</tr>';
        }) +
      '</tbody></table></div>') +
  '</div>';
};

var tplMenu = function (it, key, hideFn) {
  return '<div class="r-menu r-menu--item" role="menu" aria-label="' + esc(it.menuLabel) + '">' +
    '<button type="button" role="menuitem" class="r-menu__item"' + (it.noData ? " disabled" : "") + on(function () { downloadCsv(it); }, key + "-csv") + '>' + ICON.csv + 'Daten als CSV</button>' +
    when(hideFn, '<div class="r-menu__sep"></div><button type="button" role="menuitem" class="r-menu__item"' + on(hideFn, key + "-hide") + '>' + ICON.hide + 'Ausblenden</button>') +
  '</div>';
};

/* ---------- single scenario: chart kinds ---------- */

var tplKpis = function (it) {
  return '<div class="r-kpis">' + map(it.tiles, function (t) {
    return '<div class="r-kpis__tile">' +
      '<span class="r-kpis__label">' + esc(t.label) +
        when(t.hasDef, '<button type="button" class="r-kpis__info" aria-label="' + esc(t.defLabel) + '" aria-describedby="' + t.tipId + '">' + ICON.infoSmall + '</button>' +
          '<span class="r-kpis__tip" role="tooltip" id="' + t.tipId + '">' + esc(t.def) + '</span>') +
      '</span>' +
      '<span class="r-kpis__value"><span class="r-kpis__num">' + esc(t.value) + '</span><span class="r-kpis__unit">' + esc(t.unit) + '</span></span>' +
    '</div>';
  }) + '</div>';
};

var tplChart = function (c) {
  var out = "";
  if (c.empty) {
    return '<div class="r-nodata">' +
      '<span class="r-nodata__icon">' + ICON.noData + '</span>' +
      '<span class="r-nodata__title">Keine Daten vorhanden</span>' +
      '<span class="r-nodata__text">' + esc(c.emptyReason) + '</span>' +
      '<a class="r-nodata__link" href="#">' + esc(c.emptyAction) + '</a></div>';
  }
  if (c.hasLegend) { out += tplLegend(c.legend); }
  if (c.hbar) {
    out += '<div class="r-hbar" role="img" aria-label="' + esc(c.aria) + '">' + map(c.hrows, function (r) {
      return '<div class="r-hbar__row"><span class="r-hbar__label" title="' + esc(r.label) + '">' + esc(r.label) + '</span>' +
        '<div class="r-hbar__track">' + map(r.segs, function (s) { return '<div title="' + esc(s.title) + '" style="width: ' + s.w + '%; background: ' + s.color + '"></div>'; }) + '</div>' +
        '<span class="r-hbar__value">' + esc(r.valueText) + '</span></div>';
    }) + '</div>';
  }
  if (c.vbar) {
    out += '<div class="r-vbar" role="img" aria-label="' + esc(c.aria) + '">' +
      '<div class="r-vbar__plot">' + map(c.vcols, function (col) {
        return '<div class="r-vbar__col"><span class="r-vbar__value">' + esc(col.shortText) + '</span>' +
          '<div class="r-vbar__bar" style="height: ' + col.h + '%">' + map(col.segs, function (s) { return '<div title="' + esc(s.title) + '" style="height: ' + s.h + '%; background: ' + s.color + '"></div>'; }) + '</div></div>';
      }) + '</div>' +
      '<div class="r-vbar__labels">' + map(c.vcols, function (col) { return '<span>' + esc(col.label) + '</span>'; }) + '</div></div>';
  }
  if (c.donut) {
    out += '<div class="r-donut"><div class="r-donut__ring" role="img" aria-label="' + esc(c.aria) + '">' +
      '<svg width="180" height="180" viewBox="0 0 180 180" aria-hidden="true"><g transform="rotate(-90 90 90)" fill="none" stroke-width="28">' +
        '<circle cx="90" cy="90" r="60" stroke="#F4F7F9"></circle>' +
        map(c.parts, function (p) { return '<circle cx="90" cy="90" r="60" stroke="' + p.color + '" stroke-dasharray="' + p.dash + '" stroke-dashoffset="' + p.off + '"></circle>'; }) +
      '</g></svg>' +
      '<div class="r-donut__center" aria-hidden="true"><span>' + esc(c.donutUnit) + '</span><strong>' + esc(c.donutTotal) + '</strong></div></div>' +
      '<div class="r-donut__list" aria-hidden="true">' + map(c.parts, function (p) {
        return '<div class="r-donut__row"><span class="r-legend__swatch" style="background: ' + p.color + '"></span><span>' + esc(p.name) + '</span>' +
          '<span class="r-donut__value">' + esc(p.value) + '</span><strong>' + esc(p.pct) + '</strong></div>';
      }) + '</div></div>';
  }
  if (c.share) {
    out += '<div class="r-share" role="img" aria-label="' + esc(c.aria) + '">' +
      '<div class="r-share__bar">' + map(c.parts, function (p) { return '<div title="' + esc(p.name + ": " + p.value) + '" style="width: ' + p.w + '%; background: ' + p.color + '"></div>'; }) + '</div>' +
      '<div class="r-share__list">' + map(c.parts, function (p) {
        return '<span class="r-share__item"><span class="r-legend__swatch" style="background: ' + p.color + '"></span><span>' + esc(p.name) + '</span><b>' + esc(p.pct) + '</b><span class="r-share__value">' + esc(p.value) + '</span></span>';
      }) + '</div></div>';
  }
  if (c.plot) {
    out += '<div class="r-plot" role="img" aria-label="' + esc(c.aria) + '">' +
      '<div class="r-plot__y"><span>' + esc(c.yTop) + '</span><span>' + esc(c.yMid) + '</span><span>0</span></div>' +
      '<div class="r-plot__area"><div class="r-plot__grid r-plot__grid--top"></div><div class="r-plot__grid r-plot__grid--mid"></div>' +
        '<svg viewBox="0 0 1000 200" preserveAspectRatio="none" aria-hidden="true">' +
          [c.p0, c.p1, c.p2, c.p3, c.p4].filter(function (p) { return p && p.d !== "M0 0"; }).map(function (p) {
            return '<path d="' + p.d + '" fill="' + p.fill + '" stroke="' + p.stroke + '" stroke-width="2" vector-effect="non-scaling-stroke"></path>';
          }).join("") +
        '</svg></div><div></div>' +
      '<div class="r-plot__x">' + map(c.xlabels, function (x) { return '<span>' + esc(x.text) + '</span>'; }) + '</div></div>';
  }
  return out;
};

// Energy system and Sankey: static SVG in the prototype (in the app: Drawflow / Plotly Sankey)
var SVG_FLOW = '<svg class="r-flow" viewBox="0 0 1000 336" role="img" aria-label="Energieflüsse: Fluss-Wärmepumpe 545 MWh/a, Industrielle Abwärme 320 MWh und Biomasse-BHKW 135 MWh ins Wärmenetz; Wärmenetz 930 MWh/a, Luft-Wärmepumpe 145 MWh und Gaskessel 25 MWh zum Wärmebedarf Quartier; 70 MWh Netzverluste" font-family="Lato, Arial, sans-serif" font-size="14">' +
  '<g fill-opacity="0.38"><path d="M250 40 C385.0 40 385.0 50 520 50 L520 159 C385.0 159 385.0 149 250 149 Z" fill="#2B7FBF"></path><path d="M250 159 C385.0 159 385.0 159 520 159 L520 223 C385.0 223 385.0 223 250 223 Z" fill="#62AE6E"></path><path d="M250 233 C385.0 233 385.0 223 520 223 L520 250 C385.0 250 385.0 260 250 260 Z" fill="#B85C14"></path><path d="M534 50 C662.0 50 662.0 40 790 40 L790 226 C662.0 226 662.0 236 534 236 Z" fill="#1F567D"></path><path d="M534 236 C662.0 236 662.0 280 790 280 L790 294 C662.0 294 662.0 250 534 250 Z" fill="#C9C2B6"></path><path d="M250 275 C520.0 275 520.0 226 790 226 L790 255 C520.0 255 520.0 304 250 304 Z" fill="#9FCDEC"></path><path d="M250 314 C520.0 314 520.0 255 790 255 L790 260 C520.0 260 520.0 319 250 319 Z" fill="#5C6670"></path></g>' +
  '<g><rect x="236" y="40" width="14" height="109" fill="#2B7FBF"></rect><rect x="236" y="159" width="14" height="64" fill="#62AE6E"></rect><rect x="236" y="233" width="14" height="27" fill="#B85C14"></rect><rect x="236" y="275" width="14" height="29" fill="#9FCDEC"></rect><rect x="236" y="314" width="14" height="5" fill="#5C6670"></rect><rect x="520" y="50" width="14" height="200" fill="#1F567D"></rect><rect x="790" y="40" width="14" height="220" fill="#17405C"></rect><rect x="790" y="280" width="14" height="14" fill="#C9C2B6"></rect></g>' +
  '<g fill="#343434" text-anchor="end"><text x="226" y="90">Fluss-Wärmepumpe</text><text x="226" y="108" fill="#495965">545 MWh/a</text><text x="226" y="187">Industrielle Abwärme</text><text x="226" y="205" fill="#495965">320 MWh/a</text><text x="226" y="244">Biomasse-BHKW</text><text x="226" y="261" fill="#495965">135 MWh/a</text><text x="226" y="287">Luft-Wärmepumpe</text><text x="226" y="304" fill="#495965">145 MWh/a</text><text x="226" y="326">Gaskessel · 25 MWh/a</text></g>' +
  '<text x="527" y="18" text-anchor="middle" fill="#343434" font-weight="700">Wärmenetz · 1.000 MWh/a</text>' +
  '<g fill="#343434"><text x="816" y="142" font-weight="700">Wärmebedarf Quartier</text><text x="816" y="160" fill="#495965">1.100 MWh/a</text><text x="816" y="291">Netzverluste · 70 MWh/a</text></g></svg>';

var SVG_SYSTEM = '<div class="r-system"><svg viewBox="0 0 1000 250" role="img" aria-label="Energiesystem: Fluss-Wärmepumpe, Industrielle Abwärme und Biomasse-BHKW speisen das Wärmenetz; Wärmenetz, Luft-Wärmepumpe und Gaskessel versorgen den Wärmebedarf Quartier" font-family="Lato, Arial, sans-serif" font-size="14" font-weight="700">' +
  '<g stroke="#E39A9A" stroke-width="2.5" fill="none"><path d="M210 50 C320 50 320 125 420 125"></path><path d="M210 125 L420 125"></path><path d="M210 200 C320 200 320 125 420 125"></path><path d="M580 125 C680 125 680 115 790 115"></path><path d="M580 35 C690 35 690 125 790 125"></path><path d="M580 215 C690 215 690 135 790 135"></path></g>' +
  '<g fill="#ffffff" stroke="#E1E6EA"><rect x="50" y="25" width="160" height="50" rx="8"></rect><rect x="50" y="100" width="160" height="50" rx="8"></rect><rect x="50" y="175" width="160" height="50" rx="8"></rect><rect x="420" y="10" width="160" height="50" rx="8"></rect><rect x="420" y="190" width="160" height="50" rx="8"></rect><rect x="790" y="95" width="180" height="60" rx="8"></rect></g>' +
  '<rect x="420" y="100" width="160" height="50" rx="8" fill="#F9EEEE" stroke="#E5A3A3"></rect>' +
  '<g fill="#3B4D5E" text-anchor="middle"><text x="130" y="55">Fluss-Wärmepumpe</text><text x="130" y="130">Industrielle Abwärme</text><text x="130" y="205">Biomasse-BHKW</text><text x="500" y="40">Luft-Wärmepumpe</text><text x="500" y="130" fill="#B0473F">Wärmenetz</text><text x="500" y="220">Gaskessel</text><text x="880" y="130">Wärmebedarf Quartier</text></g></svg></div>';

/* ---------- single scenario: sections ---------- */

var tplSingle = function (v) {
  return map(v.content, function (sec) {
    return '<section class="r-section" aria-labelledby="' + sec.id + '">' +
      '<h2 class="r-section__title" id="' + sec.id + '">' + esc(sec.title) + '</h2>' +
      map(sec.subs, function (sub) {
        var single = sub.single;
        return '<div class="r-card" id="' + sub.anchor + '">' +
          '<div class="r-card__head">' +
            '<h3 class="r-card__title"><button type="button" class="r-card__toggle" aria-expanded="' + sub.openStr + '" aria-controls="' + sub.bodyId + '"' + on(sub.toggle, "sub-" + sub.id) + '>' +
              ICON.chevronRight + '<span>' + esc(sub.title) + '</span></button></h3>' +
            when(sub.hasMore, '<button type="button" class="r-card__add" aria-haspopup="menu" aria-expanded="' + sub.addStr + '" aria-label="' + esc(sub.addLabel) + '"' + on(sub.toggleAdd, "add-" + sub.id) + '>' + ICON.plus + 'Diagramm</button>') +
            (sub.isSingle ? '<button type="button" class="r-more" aria-haspopup="menu" aria-expanded="' + single.menuStr + '" aria-label="' + esc(single.menuLabel) + '"' + on(single.toggleMenu, "more-" + sub.id) + '>' + ICON.more + '</button>' : "") +
          '</div>' +
          when(sub.addOpen,
            '<div class="r-menu r-menu--add" role="menu" aria-label="' + esc(sub.addLabel) + '"><div class="r-menu__head">Diagramm hinzufügen</div>' +
              map(sub.more, function (m, i) {
                return '<button type="button" role="menuitem" class="r-menu__item r-menu__item--add"' + on(m.add, "add-" + sub.id + "-" + i) + '>' + ICON.plusItem +
                  '<span class="r-menu__text"><strong>' + esc(m.title) + '</strong>' + when(m.hasHint, '<span>' + esc(m.hint) + '</span>') + '</span></button>';
              }) + '</div>') +
          (sub.isSingle && single.menuOpen ? tplMenu(single, "more-" + sub.id, single.hide).replace("r-menu--item", "r-menu--card") : "") +
          when(sub.open,
            '<div class="r-card__body" id="' + sub.bodyId + '">' +
              when(sub.empty, '<div class="r-card__empty">Keine Diagramme eingeblendet. Über „+ Diagramm“ wieder hinzufügen.</div>') +
              '<div class="r-card__grid">' + map(sub.items, function (it) {
                var key = "item-" + it.tableId;
                var sep = it.sep.indexOf("border-left") !== -1 ? " r-item--sep-left" : it.sep ? " r-item--sep-top" : "";
                return '<div class="r-item' + (it.span === "1 / -1" ? " r-item--wide" : "") + sep + '">' +
                  when(it.showHeader, '<div class="r-item__head"><h4 class="r-item__title">' + esc(it.title) + '</h4>' +
                    '<button type="button" class="r-more" aria-haspopup="menu" aria-expanded="' + it.menuStr + '" aria-label="' + esc(it.menuLabel) + '"' + on(it.toggleMenu, key) + '>' + ICON.more + '</button></div>') +
                  when(it.srTitle, '<h4 class="r-sr-only">' + esc(it.title) + '</h4>') +
                  (it.isKpi ? tplKpis(it) : "") +
                  (it.isFlow ? SVG_FLOW : "") +
                  (it.isDiagram ? SVG_SYSTEM : "") +
                  tplChart(it.c) +
                  when(it.hasTable, tplTable(it, key)) +
                  when(it.menuInCard, tplMenu(it, key, it.hide)) +
                '</div>';
              }) + '</div>' +
            '</div>') +
        '</div>';
      }) +
    '</section>';
  });
};

/* ---------- comparison ---------- */

var tplLetter = function (letter) { return '<span class="r-letter" aria-hidden="true">' + esc(letter) + '</span>'; };

var tplSegmented = function (list, label, key) {
  return '<div class="r-segmented" role="group" aria-label="' + esc(label) + '">' + map(list, function (x, i) {
    return '<button type="button" class="r-segmented__btn" aria-pressed="' + x.on + '"' + on(x.pick, key + "-" + i) + '>' + esc(x.label) + '</button>';
  }) + '</div>';
};

var tplMatrix = function (cmp) {
  var cols = ' style="grid-template-columns: ' + cmp.gridCols + '"';
  return '<div class="r-matrix" role="table" aria-label="Szenarien im Vergleich">' +
    '<div class="r-matrix__row r-matrix__row--head" role="row"' + cols + '>' +
      '<div class="r-matrix__corner" role="columnheader">Kennzahl</div>' +
      map(cmp.heads, function (h, i) {
        return '<div class="r-matrix__head' + (h.isRef ? " is-ref" : "") + '" role="columnheader">' +
          '<div class="r-matrix__scen">' + tplLetter(h.letter) + '<span><span class="r-sr-only">Szenario ' + esc(h.letter) + ': </span>' + esc(h.short) + '</span></div>' +
          (h.isRef ? '<span class="r-badge" tabindex="-1" data-k="ref-' + esc(h.letter) + '">Bezug</span>'
            : '<button type="button" class="r-matrix__make-ref" aria-label="' + esc(h.refLabel) + '"' + on(h.makeRef, "ref-" + h.letter) + '>Als Bezug</button>') +
        '</div>';
      }) +
    '</div>' +
    map(cmp.rows, function (r) {
      if (r.isGroup) {
        return '<div class="r-matrix__row r-matrix__row--group" role="row"' + cols + '><div class="r-matrix__group" role="rowheader">' + esc(r.label) + '</div></div>';
      }
      if (r.isCompsHead) {
        return '<div class="r-matrix__row r-matrix__row--group" role="row"' + cols + '><div class="r-matrix__group r-matrix__group--btn" role="rowheader">' +
          '<button type="button" class="r-matrix__comps-toggle" aria-expanded="' + r.openStr + '" aria-controls="cmp-comps-row"' + on(r.toggle, "comps") + '>' + ICON.chevronSmall + esc(r.label) + '</button></div></div>';
      }
      if (r.isComps) {
        return '<div class="r-matrix__row" role="row" id="cmp-comps-row"' + cols + '><div class="r-matrix__label" role="rowheader"><strong>' + esc(r.label) + '</strong></div>' +
          map(r.cells, function (c, i) {
            return '<div class="r-matrix__cell r-matrix__cell--comps' + (cmp.heads[i].isRef ? " is-ref" : "") + '" role="cell"><dl>' +
              map(c.groups, function (g) { return '<div><dt>' + esc(g.label) + '</dt><dd>' + esc(g.text) + '</dd></div>'; }) + '</dl></div>';
          }) + '</div>';
      }
      return '<div class="r-matrix__row" role="row"' + cols + '>' +
        '<div class="r-matrix__label" role="rowheader"><span><strong>' + esc(r.label) + '</strong> <span class="r-matrix__unit">' + esc(r.unit) + '</span></span></div>' +
        map(r.cells, function (c, i) {
          return '<div class="r-matrix__cell' + (cmp.heads[i].isRef ? " is-ref" : "") + '" role="cell">' +
            '<div class="r-matrix__value">' +
              when(c.best, '<span class="r-best" aria-hidden="true">' + ICON.checkBest + '</span><span class="r-sr-only">Bester Wert: </span>') +
              '<span class="r-matrix__num' + (c.best ? " is-best" : "") + '">' + esc(c.value) + '</span></div>' +
            '<span class="r-matrix__delta">' + esc(c.delta) + '</span></div>';
        }) + '</div>';
    }) +
  '</div>';
};

var tplScatter = function (sc) {
  var W = 1140, PL = 80, PR = 1100, PT = 20, PB = 330;
  var lines = "";
  for (var t = 0; t < 7; t += 1) {
    var xt = sc["xt" + t], yt = sc["yt" + t];
    if (xt && xt.d !== "none") { lines += '<line x1="' + xt.p + '" x2="' + xt.p + '" y1="' + PT + '" y2="' + PB + '" stroke="#E3EAEE"></line>'; }
    if (yt && yt.d !== "none") { lines += '<line x1="' + PL + '" x2="' + PR + '" y1="' + yt.p + '" y2="' + yt.p + '" stroke="#E3EAEE"></line>'; }
  }
  var dots = "";
  for (var k = 0; k < 4; k += 1) {
    var p = sc["p" + k];
    if (!p || p.d === "none") { continue; }
    if (p.ring !== "none") { dots += '<circle cx="' + p.x + '" cy="' + p.y + '" r="12" fill="none" stroke="#1F567D" stroke-width="2"></circle>'; }
    dots += '<circle cx="' + p.x + '" cy="' + p.y + '" r="7" fill="' + p.fill + '" stroke="' + p.stroke + '" stroke-width="1.5"></circle>';
  }
  return '<div class="r-scatter" role="img" aria-label="' + esc(sc.aria) + '">' +
    '<svg width="' + W + '" height="424" viewBox="0 0 ' + W + ' 424" aria-hidden="true"><g transform="translate(0 28)">' + lines +
      '<line x1="' + PL + '" x2="' + PR + '" y1="' + PB + '" y2="' + PB + '" stroke="#A8B5C0"></line>' +
      '<line x1="' + PL + '" x2="' + PL + '" y1="' + PT + '" y2="' + PB + '" stroke="#A8B5C0"></line>' +
      '<line x1="' + sc.cx + '" x2="' + sc.cx + '" y1="' + PT + '" y2="' + PB + '" stroke="#1F567D" stroke-width="1.5" stroke-dasharray="5 5" opacity="0.7"></line>' +
      '<line x1="' + PL + '" x2="' + PR + '" y1="' + sc.cy + '" y2="' + sc.cy + '" stroke="#1F567D" stroke-width="1.5" stroke-dasharray="5 5" opacity="0.7"></line>' +
      dots + '</g></svg>' +
    // Texts are HTML on top of the SVG (sharper, and easy to translate)
    '<div aria-hidden="true">' +
      '<span class="r-scatter__text r-scatter__text--quarter" style="left: 90px; top: 54px">' + esc(sc.q.tl) + '</span>' +
      '<span class="r-scatter__text r-scatter__text--quarter" style="right: 50px; top: 54px; text-align: right">' + esc(sc.q.tr) + '</span>' +
      '<span class="r-scatter__text r-scatter__text--quarter" style="left: 90px; top: 330px">' + esc(sc.q.bl) + '</span>' +
      '<span class="r-scatter__text r-scatter__text--quarter" style="right: 50px; top: 330px; text-align: right">' + esc(sc.q.br) + '</span>' +
      '<span class="r-scatter__text r-scatter__text--title" style="left: 80px; top: 0">' + esc(sc.yTitle) + '</span>' +
      '<span class="r-scatter__text r-scatter__text--title" style="left: 590px; top: 400px; transform: translateX(-50%)">' + esc(sc.xTitle) + '</span>' +
      map(sc.xlabels, function (x) { return '<span class="r-scatter__text r-scatter__text--tick" style="left: ' + x.left + 'px; top: 366px; transform: translateX(-50%)">' + esc(x.text) + '</span>'; }) +
      map(sc.ylabels, function (y) { return '<span class="r-scatter__text r-scatter__text--tick" style="right: 1070px; top: ' + y.top + 'px; transform: translateY(-50%)">' + esc(y.text) + '</span>'; }) +
      map(sc.plabels, function (l) { return '<span class="r-scatter__text r-scatter__text--point" style="left: ' + l.left + 'px; top: ' + l.top + 'px">' + esc(l.text) + '</span>'; }) +
    '</div></div>';
};

var tplCmpBars = function (it) {
  return '<div class="r-hbar r-hbar--scenarios" role="img" aria-label="' + esc(it.aria) + '">' + map(it.bars, function (r) {
    return '<div class="r-hbar__row"><span class="r-hbar__label' + (r.weight === 700 ? " is-ref" : "") + '">' + tplLetter(r.letter) + '<span>' + esc(r.label) + '</span></span>' +
      '<div class="r-hbar__track">' + map(r.segs, function (s) { return '<div title="' + esc(s.title) + '" style="width: ' + s.w + '%; background: ' + s.color + '"></div>'; }) + '</div>' +
      '<span class="r-hbar__value">' + esc(r.valueText) + '</span></div>';
  }) + '</div>';
};

var tplMultiples = function (it) {
  return '<div class="r-multiples" style="grid-template-columns: ' + it.cols + '">' + map(it.panels, function (pn) {
    return '<div class="r-multiples__panel' + (pn.border === "#1F567D" ? " is-ref" : "") + '" role="img" aria-label="' + esc(pn.aria) + '">' +
      '<div class="r-multiples__title">' + tplLetter(pn.letter) + '<span>' + esc(pn.short) + '</span></div>' +
      '<div class="r-multiples__plot" aria-hidden="true"><span class="r-multiples__max">' + esc(pn.maxText) + '</span>' +
        map(pn.months, function (m) {
          return '<div class="r-multiples__month" title="' + esc(m.title) + '"><div class="r-multiples__gas" style="height: ' + m.g + '%"></div><div class="r-multiples__el" style="height: ' + m.e + '%"></div></div>';
        }) + '</div>' +
      '<div class="r-multiples__months" aria-hidden="true">' + map(pn.months, function (m) { return '<span>' + esc(m.l) + '</span>'; }) + '</div>' +
      '<div class="r-multiples__total">' + esc(pn.total) + '</div></div>';
  }) + '</div>';
};

var tplWaterfall = function (wf) {
  return '<div class="r-waterfall">' +
    '<div class="r-waterfall__controls"><span class="r-waterfall__from">' + esc(wf.from) + '</span>' + tplSegmented(wf.targets, "Vergleichsszenario wählen", "wf") + '</div>' +
    '<p class="r-waterfall__summary">' + esc(wf.summary) + '</p>' +
    '<div class="r-waterfall__plot" role="img" aria-label="' + esc(wf.aria) + '">' + map(wf.cols, function (c) {
      return '<div class="r-waterfall__col"><div class="r-waterfall__bar" style="bottom: ' + c.lo + '%; height: ' + c.h + '%; background: ' + c.color + '"></div>' +
        '<span class="r-waterfall__value" style="bottom: calc(' + c.top + '% + 6px); color: ' + c.textColor + '">' + esc(c.value) + '</span></div>';
    }) + '</div>' +
    '<div class="r-waterfall__labels" aria-hidden="true">' + map(wf.cols, function (c) { return '<span' + (c.weight === 700 ? ' class="is-total"' : "") + '>' + esc(c.label) + '</span>'; }) + '</div>' +
  '</div>';
};

var tplLines = function (ln) {
  var grid = "";
  [260, 220, 180, 140, 100, 60, 20].forEach(function (y) { grid += '<line x1="70" x2="1000" y1="' + y + '" y2="' + y + '" stroke="#E3EAEE"></line>'; });
  var paths = "", ends = "", marks = "", markTexts = "", yTexts = "";
  for (var k = 0; k < 4; k += 1) {
    var l = ln["l" + k];
    if (!l || l.stroke === "none") { continue; }
    paths += '<path d="' + l.d + '" fill="none" stroke="' + l.stroke + '" stroke-width="' + l.w + '" stroke-dasharray="' + l.dash + '" stroke-linecap="round"></path>';
    ends += '<span class="r-lines__text r-lines__text--end" style="left: 1010px; top: ' + l.top + 'px; color: ' + l.stroke + '">' + esc(l.letter) + '</span>';
  }
  for (var c = 0; c < 3; c += 1) {
    var m = ln["c" + c];
    if (!m || m.d === "none") { continue; }
    marks += '<line x1="' + m.x + '" x2="' + m.x + '" y1="' + m.y + '" y2="260" stroke="#495965" stroke-dasharray="3 4"></line><circle cx="' + m.x + '" cy="' + m.y + '" r="6" fill="#ffffff" stroke="#343434" stroke-width="2"></circle>';
    markTexts += '<span class="r-lines__text r-lines__text--mark" style="left: ' + m.x + 'px; top: ' + m.ty + 'px">' + esc(m.t) + '</span>';
  }
  [260, 220, 180, 140, 100, 60, 20].forEach(function (y, i) {
    yTexts += '<span class="r-lines__text r-lines__text--y" style="top: ' + y + 'px">' + esc(ln["y" + i]) + '</span>';
  });
  var xTexts = [[70, "0"], [302.5, "5"], [535, "10"], [767.5, "15"], [1000, "20"]].map(function (x) {
    return '<span class="r-lines__text r-lines__text--x" style="left: ' + x[0] + 'px">' + x[1] + '</span>';
  }).join("");
  return '<div class="r-lines">' +
    '<div class="r-lines__legend" aria-hidden="true">' + map(ln.legend, function (lg) {
      return '<span class="r-lines__legend-item"><svg width="34" height="10" viewBox="0 0 34 10"><line x1="1" x2="33" y1="5" y2="5" stroke="' + lg.stroke + '" stroke-width="' + lg.w + '" stroke-dasharray="' + lg.dash + '" stroke-linecap="round"></line></svg><strong>' + esc(lg.letter) + '</strong> ' + esc(lg.short) + '</span>';
    }) + '</div>' +
    '<div class="r-lines__plot" role="img" aria-label="' + esc(ln.aria) + '">' +
      '<svg width="1040" height="310" viewBox="0 0 1040 310" aria-hidden="true">' + grid + '<line x1="70" x2="1000" y1="260" y2="260" stroke="#A8B5C0"></line>' + paths + marks + '</svg>' +
      '<div aria-hidden="true">' + yTexts + xTexts + '<span class="r-lines__text r-lines__text--x" style="left: 535px; top: 292px">Jahre nach Inbetriebnahme</span>' + ends + markTexts + '</div>' +
    '</div></div>';
};

var tplCompare = function (v) {
  var cmp = v.cmp;
  var html = '<section class="r-section" aria-labelledby="overview">' +
    '<h2 class="r-section__title" id="overview">Vergleich auf einen Blick</h2>' +
    when(cmp.showHint,
      '<div class="r-hint" role="note">' + ICON.info + '<span>Szenarien können auf unterschiedlichen Annahmen und Systemgrenzen beruhen, etwa mit oder ohne Wärmenetz. Beachte die Komponenten der Szenarien, bevor du Kosten und Verbräuche direkt vergleichst.</span>' +
        '<button type="button" class="r-hint__close" aria-label="Hinweis ausblenden" title="Hinweis ausblenden"' + on(cmp.hideHint, "hint") + '>' + ICON.close + '</button></div>') +
    when(cmp.single, '<div class="r-panel r-panel--message">Wähle im Feld „Szenarien“ mindestens ein weiteres Szenario, um zu vergleichen.</div>') +
    (cmp.multi ?
      '<div class="r-panel"><div class="r-panel__head"><h3 class="r-panel__title">Szenarien im Vergleich</h3></div>' +
        '<div class="r-panel__body">' + tplMatrix(cmp) + '</div></div>' +
      '<div class="r-panel"><div class="r-panel__head"><h3 class="r-panel__title">Abwägung</h3>' + tplSegmented(cmp.pairs, "Größen für die Abwägung", "pair") + '</div>' +
        '<div class="r-panel__body r-panel__body--scroll">' + tplScatter(cmp.sc) + '</div></div>' : "") +
  '</section>';
  if (cmp.showSecs) {
    html += map(cmp.secs, function (cs) {
      return '<section class="r-section" aria-labelledby="' + cs.id + '"><h2 class="r-section__title" id="' + cs.id + '">' + esc(cs.title) + '</h2>' +
        map(cs.subs, function (sub, si) {
          return '<div class="r-card"><div class="r-card__head"><h3 class="r-card__title"><button type="button" class="r-card__toggle" aria-expanded="' + sub.openStr + '" aria-controls="' + sub.bodyId + '"' + on(sub.toggle, "csub-" + sub.bodyId) + '>' +
              ICON.chevronRight + '<span>' + esc(sub.title) + '</span></button></h3></div>' +
            when(sub.open, '<div class="r-card__body r-card__body--stack" id="' + sub.bodyId + '">' + map(sub.items, function (it) {
              var key = "citem-" + it.key;
              return '<div class="r-item' + (it.sep ? " r-item--sep-top" : "") + '">' +
                '<div class="r-item__intro"><div class="r-item__head"><h4 class="r-item__title">' + esc(it.title) + '</h4>' +
                  when(it.hasMenu, '<button type="button" class="r-more" aria-haspopup="menu" aria-expanded="' + it.menuStr + '" aria-label="' + esc(it.menuLabel) + '"' + on(it.toggleMenu, key) + '>' + ICON.more + '</button>') + '</div>' +
                  when(it.menuOpen, tplMenu(it, key, null)) +
                  when(it.hasNote, '<p class="r-item__note">' + esc(it.note) + '</p>') + '</div>' +
                when(it.hasLegend, tplLegend(it.legend)) +
                when(it.isBars, tplCmpBars(it)) +
                when(it.isMultiples, tplMultiples(it)) +
                (it.isWaterfall ? tplWaterfall(it.wf) : "") +
                (it.isLines ? tplLines(it.ln) : "") +
                when(it.isSame, '<div class="r-same">' + ICON.same + '<span>' + esc(it.sameText) + '</span>' +
                  '<a class="r-same__link" href="single.html#sub-timeseries">Zeitreihen in der Einzelansicht</a></div>') +
                when(it.hasTable, tplTable(it, key)) +
              '</div>';
            }) + '</div>') +
          '</div>';
        }) + '</section>';
    }) +
    '<div class="r-proto" role="note">' + ICON.info.replace('width="16" height="16"', 'width="22" height="22"') +
      '<div><strong>Prototyp – Vergleichsansicht unvollständig</strong><span>Es fehlen weitere Diagramme und Abschnitte, z. B. Anlagen &amp; Kapazitäten und Umwelt.</span></div></div>';
  }
  return html;
};


/* ==========================================================================================
   4. PAGE RUNTIME
   ------------------------------------------------------------------------------------------
   One state object; every change redraws the page from it (part 3 templates). Clicks are
   handled by delegation: on(fn) in the templates stores the handler and marks the element.
   Saved per browser: notice/hint hidden, shown and collapsed charts, selected scenarios.
   ========================================================================================== */

var handlers = [];
// Marks a clickable element: data-on = handler index, data-k = stable key (focus after redraw)
function on(fn, key) {
  if (typeof fn !== "function") { return ""; }
  handlers.push(fn);
  return ' data-on="' + (handlers.length - 1) + '"' + (key ? ' data-k="' + esc(key) + '"' : "");
}

// "Daten als CSV": the same rows as the table under the chart
function downloadCsv(it) {
  var cols = it.tcols || it.cols, rows = it.trows || it.rows;
  if (!cols || !cols.map || typeof document === "undefined") { return; }
  var cell = function (c) { c = String(c.text); return /[";\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; };
  var csv = [cols.map(cell).join(";")].concat(rows.map(function (r) { return r.cells.map(cell).join(";"); })).join("\r\n");
  var a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  a.download = (it.title || "daten").replace(/[^\wäöüÄÖÜß-]+/g, "_") + ".csv";
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
}

var STORE_KEY = "openplan.resultsPrototype";
var SAVED = ["notice", "cmpHint", "shown", "collapsed", "scenario", "compared", "hiddenSubs"];

function createPage(mode) {
  var logic = new ResultsLogic();
  logic.state.compare = mode === "compare";
  try {
    var saved = JSON.parse(window.localStorage.getItem(STORE_KEY) || "{}");
    SAVED.forEach(function (k) { if (k in saved) { logic.state[k] = saved[k]; } });
  } catch (err) { /* no storage: defaults */ }
  return logic;
}

// HTML of the four parts, used by the browser and by the build (pre-rendered pages)
function renderParts(logic) {
  handlers = [];
  var v = logic.renderVals();
  return {
    v: v,
    top: tplTop(v),
    bar: tplBar(v, false),
    pinned: tplBar(v, true),
    content: logic.state.compare ? tplCompare(v) : tplSingle(v)
  };
}

if (typeof document !== "undefined") {
  (function () {
    "use strict";
    var page = document.querySelector("[data-r-page]");
    if (!page) { return; }
    var el = {
      top: page.querySelector("[data-r-top]"),
      bar: page.querySelector("[data-r-bar]"),
      pinned: page.querySelector("[data-r-pinned]"),
      content: page.querySelector("[data-r-content]"),
      live: page.querySelector("[data-r-live]")
    };
    var logic = createPage(page.getAttribute("data-r-page"));
    var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    var render = function () {
      var focusKey = document.activeElement && document.activeElement.getAttribute("data-k");
      var parts = renderParts(logic);
      el.top.innerHTML = parts.top;
      el.bar.innerHTML = parts.bar;
      el.pinned.innerHTML = parts.pinned;
      el.content.innerHTML = parts.content;
      if (el.live && parts.v.announce && el.live.textContent !== parts.v.announce) { el.live.textContent = parts.v.announce; }
      if (focusKey) {
        var target = page.querySelector('[data-k="' + focusKey.replace(/"/g, '\\"') + '"]');
        if (target) { target.focus({ preventScroll: true }); }
      }
      onScroll();
    };

    logic.setState = function (patch) {
      Object.assign(logic.state, patch);
      try {
        var keep = {};
        SAVED.forEach(function (k) { keep[k] = logic.state[k]; });
        window.localStorage.setItem(STORE_KEY, JSON.stringify(keep));
      } catch (err) { /* storage blocked */ }
      render();
    };

    // pinned bar + current section, without redrawing the page
    var ticking = false;
    var onScroll = function () {
      ticking = false;
      var pinnedNow = el.bar.getBoundingClientRect().bottom < 52;
      el.pinned.hidden = !pinnedNow;
      if (pinnedNow !== logic.state.scrolled) {
        logic.state.scrolled = pinnedNow;
        // a bar menu belongs to the bar that just appeared/disappeared: close it
        if (logic.state.menu === "scenario" || logic.state.menu === "export") { logic.state.menu = null; render(); return; }
      }
      // a section counts as current once its heading is within ~110 px of the top (as in the canvas)
      var limit = (pinnedNow ? el.pinned.getBoundingClientRect().bottom : el.bar.getBoundingClientRect().bottom) + 60;
      var tabs = page.querySelectorAll("[data-r-tabs] a");
      var ids = Array.prototype.map.call(page.querySelector("[data-r-tabs]").querySelectorAll("a"), function (a) { return a.getAttribute("data-r-jump"); });
      var current = ids[0];
      ids.forEach(function (id) {
        var h = document.getElementById(id);
        if (h && h.getBoundingClientRect().top <= limit) { current = id; }
      });
      if (window.innerHeight + window.pageYOffset >= document.documentElement.scrollHeight - 2 && logic._clicked) { current = logic._clicked; }
      tabs.forEach(function (a) {
        if (a.getAttribute("data-r-jump") === current) { a.setAttribute("aria-current", "location"); } else { a.removeAttribute("aria-current"); }
      });
    };
    window.addEventListener("scroll", function () {
      if (!ticking) { ticking = true; window.requestAnimationFrame(onScroll); }
    }, { passive: true });
    ["wheel", "touchstart", "keydown"].forEach(function (t) { window.addEventListener(t, function () { logic._clicked = null; }, { passive: true }); });

    page.addEventListener("click", function (e) {
      var jump = e.target.closest("[data-r-jump]");
      if (jump) {
        e.preventDefault();
        var target = document.getElementById(jump.getAttribute("data-r-jump"));
        if (target) {
          // aim below the pinned bar (52 px) with some air
          var top = target.getBoundingClientRect().top + window.pageYOffset - 76;
          window.scrollTo({ top: Math.max(0, top), behavior: reduceMotion ? "auto" : "smooth" });
          logic._clicked = target.id;
        }
        return;
      }
      var act = e.target.closest("[data-on]");
      if (act && !act.disabled) {
        // menus open in the bar that was clicked (full or pinned)
        if (el.pinned.contains(act)) { logic.state.scrolled = true; } else if (el.bar.contains(act)) { logic.state.scrolled = false; }
        handlers[Number(act.getAttribute("data-on"))](e);
        return;
      }
      if (logic.state.menu && !e.target.closest(".r-menu")) {
        logic.setState({ menu: null });
      }
    });

    // Escape closes the open menu and returns focus to its button
    page.addEventListener("keydown", function (e) {
      if (e.key !== "Escape" || !logic.state.menu) { return; }
      var opener = page.querySelector('[aria-haspopup][aria-expanded="true"]');
      var key = opener && opener.getAttribute("data-k");
      logic.setState({ menu: null });
      var back = key && page.querySelector('[data-k="' + key + '"]');
      if (back) { back.focus(); }
    });

    render();
  })();
}
