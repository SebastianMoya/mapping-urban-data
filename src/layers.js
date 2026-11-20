// Land-use palette and MapLibre layers for the MapPLUTO lots.
// Colours come from Morphocode's course palette (color-palette.pdf).

export const LEGEND = [
  { id: '01', codes: ['01'], color: '#F9EDDB' },
  { id: '02-03', codes: ['02', '03'], color: '#F6D9CB' },
  { id: '04', codes: ['04'], color: '#F1B89C' },
  { id: '05', codes: ['05'], color: '#DF7649' },
  { id: '06', codes: ['06'], color: '#CF4F4F' },
  { id: '07', codes: ['07'], color: '#BEC6CC' },
  { id: '08', codes: ['08'], color: '#BDE7F4' },
  { id: '09', codes: ['09'], color: '#A3D393' },
  { id: '10', codes: ['10'], color: '#8DA2B4' },
  { id: '11', codes: ['11'], color: '#E4E4E4' },
  { id: 'nd', codes: ['nd'], color: '#F9F9F9' },
];

export const COLOR_BY_CODE = Object.fromEntries(
  LEGEND.flatMap((g) => g.codes.map((c) => [c, g.color])),
);

const NO_DATA_DARK = '#3A4252';

export function legendColor(id, theme) {
  if (id === 'nd' && theme === 'dark') return NO_DATA_DARK;
  return COLOR_BY_CODE[id] ?? LEGEND.find((g) => g.id === id)?.color;
}

export const SOURCE_ID = 'lots';
export const SOURCE_LAYER = 'lots';
export const LAYERS = {
  fill: 'lots-fill',
  extrusion: 'lots-3d',
  outline: 'lots-outline',
  highlight: 'lots-highlight',
};
export const INTERACTIVE_LAYERS = [LAYERS.fill, LAYERS.extrusion];

// Average floor-to-floor height used to turn NumFloors into metres.
export const FLOOR_HEIGHT_M = 3.5;

const landUse = ['coalesce', ['get', 'LandUse'], 'nd'];

function colorExpression(noDataColor) {
  const expr = ['match', landUse];
  for (const [code, color] of Object.entries(COLOR_BY_CODE)) {
    if (code === 'nd') continue;
    expr.push(code, color);
  }
  expr.push(noDataColor);
  return expr;
}

export function filterFor(activeGroups) {
  const codes = LEGEND.filter((g) => activeGroups.has(g.id)).flatMap((g) => g.codes);
  return ['in', landUse, ['literal', codes]];
}

export function addLotLayers(map, { pmtilesUrl, theme, is3d, activeGroups, beforeId }) {
  const dark = theme === 'dark';
  const ink = dark ? '#FFFFFF' : '#14213D';
  const noData = dark ? NO_DATA_DARK : COLOR_BY_CODE.nd;
  const filter = filterFor(activeGroups);

  if (!map.getSource(SOURCE_ID)) {
    map.addSource(SOURCE_ID, {
      type: 'vector',
      url: pmtilesUrl,
      promoteId: { [SOURCE_LAYER]: 'BBL' },
    });
  }

  map.addLayer(
    {
      id: LAYERS.fill,
      type: 'fill',
      source: SOURCE_ID,
      'source-layer': SOURCE_LAYER,
      filter,
      layout: { visibility: is3d ? 'none' : 'visible' },
      paint: {
        'fill-color': colorExpression(noData),
        'fill-opacity': dark ? 0.82 : 0.95,
      },
    },
    beforeId,
  );

  map.addLayer(
    {
      id: LAYERS.extrusion,
      type: 'fill-extrusion',
      source: SOURCE_ID,
      'source-layer': SOURCE_LAYER,
      filter,
      layout: { visibility: is3d ? 'visible' : 'none' },
      paint: {
        'fill-extrusion-color': [
          'case',
          ['boolean', ['feature-state', 'selected'], false],
          dark ? '#FFFFFF' : '#14213D',
          colorExpression(noData),
        ],
        'fill-extrusion-height': ['*', ['coalesce', ['get', 'NumFloors'], 0], FLOOR_HEIGHT_M],
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': 0.92,
        'fill-extrusion-vertical-gradient': true,
      },
    },
    beforeId,
  );

  // Lot boundaries appear once lots are big enough to read individually.
  map.addLayer(
    {
      id: LAYERS.outline,
      type: 'line',
      source: SOURCE_ID,
      'source-layer': SOURCE_LAYER,
      filter,
      minzoom: 15,
      layout: { visibility: is3d ? 'none' : 'visible' },
      paint: {
        'line-color': dark ? '#0F141C' : '#FFFFFF',
        'line-width': ['interpolate', ['linear'], ['zoom'], 15, 0.4, 18, 1.2],
        'line-opacity': 0.9,
      },
    },
    beforeId,
  );

  map.addLayer(
    {
      id: LAYERS.highlight,
      type: 'line',
      source: SOURCE_ID,
      'source-layer': SOURCE_LAYER,
      layout: { visibility: is3d ? 'none' : 'visible', 'line-join': 'round' },
      paint: {
        'line-color': ink,
        'line-width': [
          'case',
          ['boolean', ['feature-state', 'selected'], false], 2.5,
          ['boolean', ['feature-state', 'hover'], false], 1.5,
          0,
        ],
        'line-opacity': [
          'case',
          ['boolean', ['feature-state', 'selected'], false], 1,
          0.55,
        ],
      },
    },
    beforeId,
  );
}

export function setLotFilter(map, activeGroups) {
  const filter = filterFor(activeGroups);
  for (const id of [LAYERS.fill, LAYERS.extrusion, LAYERS.outline]) {
    if (map.getLayer(id)) map.setFilter(id, filter);
  }
}

export function setLotView(map, is3d) {
  const vis = (on) => (on ? 'visible' : 'none');
  if (!map.getLayer(LAYERS.fill)) return;
  map.setLayoutProperty(LAYERS.fill, 'visibility', vis(!is3d));
  map.setLayoutProperty(LAYERS.outline, 'visibility', vis(!is3d));
  map.setLayoutProperty(LAYERS.highlight, 'visibility', vis(!is3d));
  map.setLayoutProperty(LAYERS.extrusion, 'visibility', vis(is3d));
}
