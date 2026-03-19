const API_BASE  = 'https://lol-recommender.onrender.com'; // update to your Render URL
const PATCH     = '16.5.1';
const DDragon   = `https://ddragon.leagueoflegends.com/cdn/${PATCH}`;
const TOP_K     = 5;
const MIN_GAMES = 10;

const CATEGORIES = [
  { key: 'keystone',     label: 'Keystone Rune',   type: 'rune' },
  { key: 'secondary',    label: 'Secondary Tree',  type: 'rune' },
  { key: 'summs',        label: 'Summoner Spells', type: 'summ' },
  { key: 'starter_item', label: 'Starter Item',    type: 'item' },
  { key: 'boots',        label: 'Boots',           type: 'item' },
  { key: 'item1',        label: 'First Item',      type: 'item' },
  { key: 'item2',        label: 'Second Item',     type: 'item' },
  { key: 'item3',        label: 'Third Item',      type: 'item' },
  { key: 'item4',        label: 'Fourth+ Item',    type: 'item' },
];

let allChampions = [];
let selected     = { champion: null, championId: null, role: null, rank: null };
let selectedBuild = {}; // { keystone: '8437', boots: '3047', ... } — chosen rec rows
let runeIconMap  = {};
let summImgMap   = {};

// ── Load rune icons ───────────────────────────────────────────────────────────
async function loadRuneIcons() {
  try {
    const res  = await fetch(`${DDragon}/data/en_US/runesReforged.json`);
    const data = await res.json();
    for (const tree of data) {
      runeIconMap[tree.id] = `https://ddragon.leagueoflegends.com/cdn/img/${tree.icon}`;
      for (const slot of tree.slots) {
        for (const rune of slot.runes) {
          runeIconMap[rune.id] = `https://ddragon.leagueoflegends.com/cdn/img/${rune.icon}`;
        }
      }
    }
  } catch (e) { console.warn('Could not load rune icons'); }
}

// ── Load summoner spell icons ─────────────────────────────────────────────────
async function loadSummIcons() {
  try {
    const res  = await fetch(`${DDragon}/data/en_US/summoner.json`);
    const data = await res.json();
    for (const spell of Object.values(data.data)) {
      summImgMap[parseInt(spell.key)] = `${DDragon}/img/spell/${spell.id}.png`;
    }
  } catch (e) { console.warn('Could not load summoner spell icons'); }
}

// ── ID normalisation — float IDs from backend must be int strings ─────────────
function normaliseId(rawId) {
  // e.g. "3078.0" → "3078", "8437" → "8437"
  return String(Math.round(parseFloat(rawId)));
}

// ── Image helpers ─────────────────────────────────────────────────────────────
function resolveImages(type, rawId) {
  const id = normaliseId(rawId);
  if (type === 'item') {
    return `<img src="${DDragon}/img/item/${id}.png" class="rec-icon" alt="" />`;
  }
  if (type === 'rune') {
    const url = runeIconMap[parseInt(id)];
    return url ? `<img src="${url}" class="rec-icon" alt="" />` : '';
  }
  if (type === 'summ') {
    return rawId.split('/').map(s => {
      const url = summImgMap[parseInt(s.trim())];
      return url ? `<img src="${url}" class="rec-icon" alt="" />` : '';
    }).join('');
  }
  return '';
}

// ── Name helpers ──────────────────────────────────────────────────────────────
function resolveName(type, rawId) {
  const id = normaliseId(rawId);
  const { runes, items, summs } = CONVERSION.numToName;
  if (type === 'rune') return runes[String(id)] ?? id;
  if (type === 'item') return items[id] ?? id;
  if (type === 'summ') {
    return rawId.split('/').map(s => summs[s.trim()] ?? s).join(', ');
  }
  return id;
}

// ── Summoner ID sorter ────────────────────────────────────────────────────────
function sortSumms(ids) {
  return ids.sort((a, b) => {
    if (a.trim() === '4') return -1;
    if (b.trim() === '4') return 1;
    return 0;
  });
}

// ── Champion list ─────────────────────────────────────────────────────────────
async function loadChampions() {
  try {
    const res  = await fetch(`${DDragon}/data/en_US/champion.json`);
    const json = await res.json();
    allChampions = Object.values(json.data)
      .map(c => ({ id: c.id, name: c.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    renderGrid(allChampions);
  } catch (e) {
    document.getElementById('champion-grid').innerHTML =
      '<p style="color:var(--text-muted);font-size:13px;padding:16px;">Could not load champion list.</p>';
  }
}

function renderGrid(champs) {
  document.getElementById('champion-grid').innerHTML = champs.map(c => `
    <div class="champ-card${selected.championId === c.id ? ' selected' : ''}"
         data-id="${c.id}" data-name="${c.name}" onclick="selectChampion(this)">
      <img src="${DDragon}/img/champion/${c.id}.png" alt="${c.name}" loading="lazy" />
      <p class="champ-name">${c.name}</p>
    </div>
  `).join('');
}

document.getElementById('search').addEventListener('input', e => {
  const q = e.target.value.toLowerCase();
  renderGrid(q ? allChampions.filter(c => c.name.toLowerCase().includes(q)) : allChampions);
});

function selectChampion(el) {
  selected.championId = el.dataset.id;
  selected.champion   = el.dataset.name;
  selectedBuild       = {}; // reset build choices when champion changes
  document.querySelectorAll('.champ-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('hero-portrait').src = `${DDragon}/img/champion/${selected.championId}.png`;
  document.getElementById('hero-name').textContent = selected.champion;
  document.getElementById('config-panel').classList.add('visible');
  document.getElementById('results').classList.remove('visible');
  document.getElementById('config-panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  document.getElementById('get-btn').removeAttribute('disabled');
}

// ── Pill selectors (role / rank) ──────────────────────────────────────────────
function makePillGroup(groupId, key) {
  document.getElementById(groupId).addEventListener('click', e => {
    const pill = e.target.closest('.pill');
    if (!pill) return;
    const isActive = pill.classList.contains('active');
    document.querySelectorAll(`#${groupId} .pill`).forEach(p => p.classList.remove('active'));
    if (isActive) {
      selected[key] = null;
    } else {
      pill.classList.add('active');
      selected[key] = pill.dataset.val;
    }
  });
}
makePillGroup('role-group', 'role');
makePillGroup('rank-group', 'rank');

// ── Build params — includes role, rank, AND any chosen build options ──────────
function buildParams(extra = {}, buildOverride = selectedBuild) {
  const raw = {
    champ: selected.champion,
    role:  selected.role,
    tier:  selected.rank,
    ...buildOverride,  
    ...extra
  };
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) {
    if (v !== null && v !== undefined) p.append(k, v);
  }
  return p.toString();
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────
async function fetchWinrate() {
  const res  = await fetch(`${API_BASE}/winrate?${buildParams()}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

async function fetchTop(key) {
  // exclude this key from params so it isn't double-filtered against itself
  const { [key]: _, ...buildWithoutKey } = selectedBuild; // exclude current key
  const params = buildParams({ key, k: TOP_K, min_games: MIN_GAMES }, buildWithoutKey);
  const res    = await fetch(`${API_BASE}/top?${params}`);
  const data   = await res.json();
  if (data.error) throw new Error(data.error);

  // normalise summs so "4/14" and "14/4" are the same
  const normalised = {};
  for (const [rawId, stats] of Object.entries(data)) {
    const normKey = key === 'summs' ? rawId : normaliseId(rawId);
    normalised[normKey] = { ...stats };
  }

  return Object.entries(normalised)
    .map(([rawId, stats]) => ({ rawId, ...stats }))
    .sort((a, b) => b.winrate - a.winrate);
}

// ── Fetch and render everything ───────────────────────────────────────────────
async function fetchAndRender() {
  if (!selected.champion) return;
  const inner = document.getElementById('results-inner');
  document.getElementById('results').classList.add('visible');
  inner.innerHTML = '<div class="spinner">Calculating win probabilities</div>';

  try {
    const [base, ...topResults] = await Promise.all([
      fetchWinrate(),
      ...CATEGORIES.map(cat => fetchTop(cat.key))
    ]);
    renderResults(base, topResults);
  } catch (e) {
    inner.innerHTML = `<div class="error-msg">Error: ${e.message}</div>`;
  }
}

document.getElementById('get-btn').addEventListener('click', () => {
  selectedBuild = {}; // reset build when clicking Get Recommendations fresh
  document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  fetchAndRender();
});

// ── Handle clicking a recommendation row ──────────────────────────────────────
function toggleBuildChoice(key, rawId) {
  const normId = key === 'summs' ? rawId : normaliseId(rawId);
  if (selectedBuild[key] === normId) {
    delete selectedBuild[key];
  } else {
    selectedBuild[key] = normId;
  }
  fetchAndRender();
}

// ── Render results ────────────────────────────────────────────────────────────
function renderResults(base, topResults) {
  const inner   = document.getElementById('results-inner');
  const filters = [selected.champion];
  if (selected.role) filters.push(selected.role);
  if (selected.rank) filters.push(selected.rank);

  let heroHtml;
  if (base.games === 0) {
    heroHtml = `
      <div class="win-rate-hero">
        <p class="wr-label">${filters.join(' &middot; ')}</p>
        <p class="wr-number" style="font-size:2rem;">No data available</p>
        <p class="wr-sub">Try removing some filters</p>
      </div>`;
  } else {
    const baseWr = base.winrate * 100;
    heroHtml = `
      <div class="win-rate-hero">
        <p class="wr-label">${filters.join(' &middot; ')}</p>
        <p class="wr-number">${baseWr.toFixed(1)}<span style="font-size:0.45em;opacity:0.6">%</span></p>
        <p class="wr-sub">Overall win rate with current filters</p>
        <p class="wr-games">${base.games.toLocaleString()} games &middot; ${base.wins.toLocaleString()} wins</p>
      </div>`;
  }

  const baseWr = base.games > 0 ? base.winrate * 100 : 50;

  const cards = CATEGORIES.map(({ key, label, type }, ci) => {
    const rows = topResults[ci];
    if (!rows || rows.length === 0) return '';

    const maxWr    = Math.max(...rows.map(r => r.winrate));
    const chosenId = selectedBuild[key] ?? null;

    const rowsHtml = rows.map((row, i) => {
      const normId = key === 'summs' ? row.rawId : normaliseId(row.rawId);      
      const isChosen = normId === chosenId;
      const wr      = row.winrate * 100;
      const delta   = wr - baseWr;
      const dCls    = delta > 0.5 ? 'pos' : delta < -0.5 ? 'neg' : 'neu';
      const dStr    = (delta >= 0 ? '+' : '') + delta.toFixed(1) + '%';
      const barPct  = (row.winrate / maxWr * 100).toFixed(1);
      const imgs    = resolveImages(type, row.rawId);
      const name    = resolveName(type, row.rawId);
      return `
        <div class="rec-row${isChosen ? ' chosen' : ''}" onclick="toggleBuildChoice('${key}', '${row.rawId}')">
          <span class="rec-rank">${i + 1}</span>
          <div class="rec-icons">${imgs}</div>
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:8px;">
              <span class="rec-name">${name}</span>
              <span class="rec-games">${row.games.toLocaleString()}g</span>
              <span class="rec-wr">${wr.toFixed(1)}%</span>
              <span class="rec-delta ${dCls}">${dStr}</span>
            </div>
            <div class="bar-wrap"><div class="bar-fill" style="width:${barPct}%"></div></div>
          </div>
        </div>`;
    }).join('');

    return `
      <div class="rec-card${chosenId ? ' has-choice' : ''}" style="animation-delay:${ci * 60}ms">
        <p class="rec-title">${label}${chosenId ? ' <span class="chosen-badge">selected</span>' : ''}</p>
        ${rowsHtml}
      </div>`;
  }).join('');

  inner.innerHTML = heroHtml + `<div class="rec-grid">${cards}</div>`;
}

// ── Init ──────────────────────────────────────────────────────────────────────
Promise.all([loadChampions(), loadRuneIcons(), loadSummIcons()]);