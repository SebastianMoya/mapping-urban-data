import { legendColor } from './layers.js';

const SQFT_TO_M2 = 0.09290304;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function titleCase(s) {
  return s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

// Builds the lot card shown in the popup. Everything goes through textContent: the data is never parsed as HTML.
export function lotCard(props, strings, lang, theme) {
  const t = strings.popup;
  const nf = new Intl.NumberFormat(lang === 'es' ? 'es-CL' : 'en-US');
  const area = (sqft) =>
    sqft ? `${nf.format(Math.round(sqft * SQFT_TO_M2))} m² (${nf.format(sqft)} ft²)` : null;

  const code = props.LandUse || 'nd';
  const card = el('article', 'lot');
  card.style.setProperty('--lot-color', legendColor(code, theme) || legendColor('nd', theme));

  const head = el('header', 'lot-head');
  head.append(el('h2', 'lot-address', props.Address ? titleCase(props.Address) : t.noAddress));
  const use = el('p', 'lot-use');
  use.append(el('span', 'swatch'), document.createTextNode(strings.landUse[code] || strings.landUse.nd));
  head.append(use);
  card.append(head);

  // Key figures: the four numbers people compare between lots.
  const figures = [
    [t.floors, props.NumFloors != null ? nf.format(props.NumFloors) : null],
    [t.yearBuilt, props.YearBuilt ? String(props.YearBuilt) : null],
    [t.units, props.UnitsRes ? nf.format(props.UnitsRes) : null],
    [t.zoning, props.ZoneDist1],
  ].filter(([, v]) => v);
  if (figures.length) {
    const grid = el('dl', 'lot-figures');
    for (const [k, v] of figures) {
      const item = el('div');
      item.append(el('dt', null, k), el('dd', null, v));
      grid.append(item);
    }
    card.append(grid);
  }

  const details = [
    [t.lotArea, area(props.LotArea)],
    [t.bldgArea, area(props.BldgArea)],
    [t.bldgClass, props.BldgClass],
    [t.owner, props.OwnerName],
    [t.histDist, props.HistDist],
    [t.landmark, props.Landmark ? titleCase(props.Landmark) : null],
    [t.bbl, props.BBL],
  ].filter(([, v]) => v);
  const list = el('dl', 'lot-details');
  for (const [k, v] of details) list.append(el('dt', null, k), el('dd', null, v));
  card.append(list);

  if (props.Block && props.Lot) {
    const link = el('a', 'lot-link', t.zola);
    link.href = `https://zola.planning.nyc.gov/l/lot/1/${props.Block}/${props.Lot}`;
    link.target = '_blank';
    link.rel = 'noopener';
    card.append(link);
  }
  return card;
}
