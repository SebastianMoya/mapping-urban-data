import * as maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Protocol } from 'pmtiles';
import '@fontsource-variable/archivo/wdth.css';
import './style.css';

import stats from './data/landuse-stats.json';
import { STRINGS, detectLang } from './i18n.js';
import {
  LEGEND, INTERACTIVE_LAYERS, SOURCE_ID, SOURCE_LAYER,
  addLotLayers, setLotFilter, setLotView, legendColor,
} from './layers.js';
import { lotCard } from './popup.js';
import { createGeocoder } from './geocoder.js';

const REPO_URL = 'https://github.com/SebastianMoya/mapping-urban-data';
const BASEMAPS = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
};
const DETAIL_ZOOM = 14; // tiles carry every lot attribute from z14
const PMTILES_URL = `pmtiles://${new URL(`${import.meta.env.BASE_URL}data/mn_lots.pmtiles`, location.href).href}`;

maplibregl.setWorkerUrl(workerUrl);
const protocol = new Protocol();
maplibregl.addProtocol('pmtiles', protocol.tile);

const $ = (sel, root = document) => root.querySelector(sel);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const systemDark = matchMedia('(prefers-color-scheme: dark)');

function load(key, fallback) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, value); } catch {}
}

const state = {
  lang: detectLang(),
  themePref: load('mud-theme', 'auto'),
  is3d: false,
  active: new Set(LEGEND.map((g) => g.id)),
  hoverId: null,
  selected: null, // { id, props, lngLat }
  fallbackBasemap: false,
};

const t = () => STRINGS[state.lang];
const resolvedTheme = () =>
  state.themePref === 'auto' ? (systemDark.matches ? 'dark' : 'light') : state.themePref;

// ---------------------------------------------------------------- map

function fallbackStyle(theme) {
  return {
    version: 8,
    sources: {},
    layers: [{ id: 'background', type: 'background', paint: { 'background-color': theme === 'dark' ? '#1B202A' : '#EEF0F4' } }],
  };
}

const map = new maplibregl.Map({
  container: 'map',
  style: BASEMAPS[resolvedTheme()],
  center: [-73.994, 40.729],
  zoom: 13,
  minZoom: 12,
  maxZoom: 19,
  maxPitch: 70,
  maxBounds: [[-74.15, 40.62], [-73.8, 40.93]],
  hash: true,
  attributionControl: {
    compact: true,
    customAttribution:
      '<a href="https://www.nyc.gov/site/planning/data-maps/open-data/dwn-pluto-mappluto.page" target="_blank" rel="noopener">MapPLUTO 18v2.1 © NYC DCP</a>',
  },
});
map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right');

// If the hash in a shared link already carries pitch, open in 3D.
if (map.getPitch() > 0) state.is3d = true;

map.on('style.load', () => {
  const firstSymbol = map.getStyle().layers.find((l) => l.type === 'symbol');
  addLotLayers(map, {
    pmtilesUrl: PMTILES_URL,
    theme: resolvedTheme(),
    is3d: state.is3d,
    activeGroups: state.active,
    beforeId: firstSymbol?.id,
  });
  state.hoverId = null;
  if (state.selected) setSelected(state.selected.id, true);
});

// Keep the lots on screen even when the basemap service cannot be reached.
map.on('error', (e) => {
  if (state.fallbackBasemap || map.isStyleLoaded()) return;
  console.warn('Basemap unavailable, using a plain background.', e.error);
  state.fallbackBasemap = true;
  map.setStyle(fallbackStyle(resolvedTheme()));
});

function setBasemap() {
  const theme = resolvedTheme();
  document.documentElement.dataset.theme = theme;
  renderLegend();
  renderPopup();
  const style = state.fallbackBasemap ? fallbackStyle(theme) : BASEMAPS[theme];
  if (map.loaded() || map.isStyleLoaded()) map.setStyle(style, { diff: false });
}

// ---------------------------------------------------------------- hover + selection

function featureKey(id) {
  return { source: SOURCE_ID, sourceLayer: SOURCE_LAYER, id };
}

function setHover(id) {
  if (state.hoverId === id) return;
  if (state.hoverId != null) map.setFeatureState(featureKey(state.hoverId), { hover: false });
  state.hoverId = id;
  if (id != null) map.setFeatureState(featureKey(id), { hover: true });
}

function setSelected(id, on) {
  if (id != null && map.getSource(SOURCE_ID)) map.setFeatureState(featureKey(id), { selected: on });
}

const visibleLayers = () => INTERACTIVE_LAYERS.filter((id) => map.getLayer(id) && map.getLayoutProperty(id, 'visibility') !== 'none');

map.on('mousemove', (e) => {
  const [f] = map.queryRenderedFeatures(e.point, { layers: visibleLayers() });
  map.getCanvas().style.cursor = f ? 'pointer' : '';
  setHover(f ? f.id : null);
});
map.on('mouseout', () => setHover(null));

const popup = new maplibregl.Popup({ maxWidth: '340px', offset: 10, focusAfterOpen: false, className: 'lot-popup' });
popup.on('close', () => {
  if (state.selected) setSelected(state.selected.id, false);
  state.selected = null;
});

function renderPopup() {
  if (!state.selected) return;
  popup.setLngLat(state.selected.lngLat).setDOMContent(lotCard(state.selected.props, t(), state.lang, resolvedTheme()));
  if (!popup.isOpen()) popup.addTo(map);
}

function openLotAt(lngLat) {
  const point = map.project(lngLat);
  const [f] = map.queryRenderedFeatures(point, { layers: visibleLayers() });
  if (!f) return false;
  if (state.selected) setSelected(state.selected.id, false);
  state.selected = { id: f.id, props: f.properties, lngLat };
  setSelected(f.id, true);
  renderPopup();
  return true;
}

function flyAndOpen(lngLat, zoom) {
  map.flyTo({ center: lngLat, zoom, essential: false, duration: reducedMotion.matches ? 0 : undefined });
  map.once('idle', () => openLotAt(lngLat));
}

map.on('click', (e) => {
  const [f] = map.queryRenderedFeatures(e.point, { layers: visibleLayers() });
  if (!f) return popup.remove();
  // Overview tiles only carry colour and height, so zoom in before showing the lot card.
  if (map.getZoom() < DETAIL_ZOOM) flyAndOpen(e.lngLat, 16);
  else openLotAt(e.lngLat);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && popup.isOpen()) popup.remove();
});

// ---------------------------------------------------------------- legend

const pct = (share) =>
  new Intl.NumberFormat(state.lang === 'es' ? 'es-CL' : 'en-US', {
    style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1,
  }).format(share);

function renderLegend() {
  const strip = $('#strip');
  const list = $('#legend-list');
  strip.replaceChildren();
  list.replaceChildren();

  for (const group of LEGEND) {
    const s = stats.groups[group.id];
    const on = state.active.has(group.id);

    const seg = document.createElement('span');
    seg.style.flexGrow = String(s.lotAreaShare);
    seg.style.background = legendColor(group.id, resolvedTheme());
    seg.dataset.group = group.id;
    seg.classList.toggle('off', !on);
    strip.append(seg);

    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'legend-item';
    btn.dataset.group = group.id;
    btn.setAttribute('aria-pressed', String(on));
    btn.style.setProperty('--swatch', legendColor(group.id, resolvedTheme()));
    btn.innerHTML = '<span class="swatch" aria-hidden="true"></span><span class="name"></span><span class="share"></span>';
    $('.name', btn).textContent = t().landUse[group.id];
    $('.share', btn).textContent = pct(s.lotAreaShare);
    btn.title = `${new Intl.NumberFormat(state.lang === 'es' ? 'es-CL' : 'en-US').format(s.lots)} ${state.lang === 'es' ? 'lotes' : 'lots'}`;
    btn.addEventListener('click', () => toggleGroup(group.id));
    btn.addEventListener('mouseenter', () => strip.querySelector(`[data-group="${group.id}"]`)?.classList.add('lit'));
    btn.addEventListener('mouseleave', () => strip.querySelector(`[data-group="${group.id}"]`)?.classList.remove('lit'));
    li.append(btn);
    list.append(li);
  }
  $('#show-all').hidden = state.active.size === LEGEND.length;
}

function toggleGroup(id) {
  if (state.active.has(id)) state.active.delete(id);
  else state.active.add(id);
  setLotFilter(map, state.active);
  renderLegend();
  $(`.legend-item[data-group="${id}"]`)?.focus();
}

$('#show-all').addEventListener('click', () => {
  state.active = new Set(LEGEND.map((g) => g.id));
  setLotFilter(map, state.active);
  renderLegend();
});

// ---------------------------------------------------------------- view, theme, language

function setPressed(group, attr, value) {
  for (const b of group.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.getAttribute(attr) === value));
}

function setView(is3d, animate = true) {
  state.is3d = is3d;
  setLotView(map, is3d);
  setPressed($('#view-group'), 'data-view', is3d ? '3d' : '2d');
  $('#view-hint').hidden = !is3d;
  if (!animate) return;
  map.easeTo({
    pitch: is3d ? 60 : 0,
    bearing: is3d ? -20 : 0,
    zoom: is3d ? Math.max(map.getZoom(), 14.5) : map.getZoom(),
    duration: reducedMotion.matches ? 0 : 1200,
  });
}

$('#view-group').addEventListener('click', (e) => {
  const v = e.target.closest('button')?.dataset.view;
  if (v) setView(v === '3d');
});

$('#theme-group').addEventListener('click', (e) => {
  const v = e.target.closest('button')?.dataset.themeOption;
  if (!v || v === state.themePref) return;
  const before = resolvedTheme();
  state.themePref = v;
  save('mud-theme', v);
  setPressed($('#theme-group'), 'data-theme-option', v);
  if (resolvedTheme() !== before) setBasemap();
});
systemDark.addEventListener('change', () => state.themePref === 'auto' && setBasemap());

$('#lang-group').addEventListener('click', (e) => {
  const v = e.target.closest('button')?.dataset.lang;
  if (!v || v === state.lang) return;
  state.lang = v;
  save('mud-lang', v);
  applyLanguage();
});

function applyLanguage() {
  const s = t();
  document.documentElement.lang = state.lang;
  document.title = s.title;
  for (const node of document.querySelectorAll('[data-i18n]')) node.textContent = s[node.dataset.i18n];
  $('#subtitle').textContent = s.subtitle(new Intl.NumberFormat(state.lang === 'es' ? 'es-CL' : 'en-US').format(stats.totalLots));
  $('#search').placeholder = s.searchPlaceholder;
  $('#view-group').setAttribute('aria-label', s.viewLabel);
  $('#theme-group').setAttribute('aria-label', s.themeLabel);
  $('#lang-group').setAttribute('aria-label', s.langLabel);
  setPressed($('#lang-group'), 'data-lang', state.lang);
  updateSheetLabel();
  renderLegend();
  renderPopup();
}

// ---------------------------------------------------------------- mobile sheet + about

const panel = $('#panel');
function updateSheetLabel() {
  const collapsed = panel.dataset.collapsed === 'true';
  $('#sheet-toggle').setAttribute('aria-expanded', String(!collapsed));
  $('#sheet-toggle-label').textContent = collapsed ? t().expand : t().collapse;
}
$('#sheet-toggle').addEventListener('click', () => {
  panel.dataset.collapsed = panel.dataset.collapsed === 'true' ? 'false' : 'true';
  updateSheetLabel();
});

const about = $('#about');
$('#about-open').addEventListener('click', () => about.showModal());
about.addEventListener('click', (e) => { if (e.target === about) about.close(); });
$('#repo-link').href = REPO_URL;

// ---------------------------------------------------------------- search

createGeocoder({
  input: $('#search'),
  list: $('#search-results'),
  status: $('#search-status'),
  getStrings: t,
  onSelect: (coords) => {
    if (mobile.matches) {
      panel.dataset.collapsed = 'true';
      updateSheetLabel();
    }
    flyAndOpen(coords, 17);
  },
});

// Keep the map's visual centre clear of the panel (left on desktop, bottom sheet on mobile).
// Only re-pad when the value changes: setPadding stops any camera animation in progress.
const mobile = matchMedia('(max-width: 640px)');
let lastPadding = '';
new ResizeObserver(() => {
  const r = panel.getBoundingClientRect();
  const root = document.documentElement.style;
  let padding;
  if (mobile.matches) {
    root.setProperty('--sheet-h', `${Math.round(r.height)}px`);
    if (panel.dataset.collapsed !== 'true') return; // an open legend is temporary; keep the camera still
    padding = { top: 0, right: 0, left: 0, bottom: Math.round(r.height) };
  } else {
    root.setProperty('--sheet-h', '0px');
    padding = { top: 0, right: 0, bottom: 0, left: Math.round(r.width + 16) };
  }
  const key = JSON.stringify(padding);
  if (key === lastPadding) return;
  lastPadding = key;
  map.setPadding(padding);
}).observe(panel);

// ---------------------------------------------------------------- boot

document.documentElement.dataset.theme = resolvedTheme();
setPressed($('#theme-group'), 'data-theme-option', state.themePref);
setView(state.is3d, false);
applyLanguage();

// Handy for debugging in the console.
window.map = map;
