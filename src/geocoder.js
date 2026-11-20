// Address search backed by NYC Planning's GeoSearch (Pelias + Property Address Directory).
// Docs: https://labs-geosearch-docs.netlify.app/docs

const ENDPOINT = 'https://geosearch.planninglabs.nyc/v2/autocomplete';
const MANHATTAN = { minLon: -74.05, minLat: 40.68, maxLon: -73.9, maxLat: 40.88 };

function inManhattan(feature) {
  const p = feature.properties || {};
  if (p.borough) return p.borough === 'Manhattan';
  const [lon, lat] = feature.geometry?.coordinates || [];
  return lon >= MANHATTAN.minLon && lon <= MANHATTAN.maxLon && lat >= MANHATTAN.minLat && lat <= MANHATTAN.maxLat;
}

export function createGeocoder({ input, list, status, getStrings, onSelect }) {
  let results = [];
  let active = -1;
  let timer = null;
  let controller = null;
  let requestId = 0;

  function setExpanded(open) {
    input.setAttribute('aria-expanded', String(open));
    list.hidden = !open;
  }

  function setStatus(message) {
    status.textContent = message || '';
    status.hidden = !message;
  }

  function render() {
    list.replaceChildren();
    results.forEach((f, i) => {
      const li = document.createElement('li');
      li.id = `geocoder-option-${i}`;
      li.role = 'option';
      li.setAttribute('aria-selected', String(i === active));
      const label = f.properties.name || f.properties.label;
      const detail = [f.properties.neighbourhood, f.properties.postalcode].filter(Boolean).join(', ');
      li.innerHTML = '<span class="opt-main"></span><span class="opt-detail"></span>';
      li.querySelector('.opt-main').textContent = label;
      li.querySelector('.opt-detail').textContent = detail;
      li.addEventListener('mousedown', (e) => {
        e.preventDefault();
        choose(i);
      });
      list.append(li);
    });
    input.setAttribute('aria-activedescendant', active >= 0 ? `geocoder-option-${active}` : '');
    setExpanded(results.length > 0);
  }

  function choose(i) {
    const f = results[i];
    if (!f) return;
    input.value = f.properties.name || f.properties.label;
    results = [];
    active = -1;
    render();
    setStatus('');
    onSelect(f.geometry.coordinates, f);
  }

  async function search(text) {
    const id = ++requestId;
    controller?.abort();
    controller = new AbortController();
    const params = new URLSearchParams({
      text,
      size: '10',
      'focus.point.lat': '40.7685',
      'focus.point.lon': '-73.9822',
      'boundary.rect.min_lon': String(MANHATTAN.minLon),
      'boundary.rect.min_lat': String(MANHATTAN.minLat),
      'boundary.rect.max_lon': String(MANHATTAN.maxLon),
      'boundary.rect.max_lat': String(MANHATTAN.maxLat),
    });
    try {
      const res = await fetch(`${ENDPOINT}?${params}`, { signal: controller.signal });
      if (!res.ok) throw new Error(`GeoSearch ${res.status}`);
      const data = await res.json();
      if (id !== requestId) return; // a newer request already answered
      results = (data.features || []).filter(inManhattan).slice(0, 6);
      active = results.length ? 0 : -1;
      render();
      setStatus(results.length ? '' : getStrings().searchEmpty);
    } catch (err) {
      if (err.name === 'AbortError' || id !== requestId) return;
      results = [];
      render();
      setStatus(getStrings().searchError);
    }
  }

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const text = input.value.trim();
    if (text.length < 3) {
      results = [];
      render();
      setStatus('');
      return;
    }
    timer = setTimeout(() => search(text), 220);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && results.length) {
      e.preventDefault();
      active = (active + 1) % results.length;
      render();
    } else if (e.key === 'ArrowUp' && results.length) {
      e.preventDefault();
      active = (active - 1 + results.length) % results.length;
      render();
    } else if (e.key === 'Enter') {
      if (active >= 0) {
        e.preventDefault();
        choose(active);
      }
    } else if (e.key === 'Escape') {
      results = [];
      render();
      setStatus('');
    }
  });

  input.addEventListener('blur', () => setTimeout(() => setExpanded(false), 120));
  input.addEventListener('focus', () => results.length && setExpanded(true));
}
