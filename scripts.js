const API_BASE  = 'https://lol-recommender.onrender.com';
const PATCH     = '16.5.1';
const DDragon   = `https://ddragon.leagueoflegends.com/cdn/${PATCH}`;
const TOP_K     = 5;

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

let allChampions  = [];
let selected      = { champion: null, championId: null, role: null, rank: null, vs: null };
let selectedBuild = {};
let runeIconMap   = {};
let summImgMap    = {};

const cardSettings = {};
function getCardSettings(key) {
  if (!cardSettings[key]) cardSettings[key] = { sortBy: 'winrate', minGames: 10 };
  return cardSettings[key];
}
function setCardSort(key, val) {
  getCardSettings(key).sortBy = val;
  fetchAndRender();
}
function setCardMin(key, val) {
  getCardSettings(key).minGames = val;
  fetchAndRender();
}

let globalCardSettings = { sortBy: 'winrate', minGames: 10 };
function setAllSort(val) {
  globalCardSettings.sortBy = val;
  CATEGORIES.forEach(({ key }) => { getCardSettings(key).sortBy = val; });
  fetchAndRender();
}
function setAllMin(val) {
  globalCardSettings.minGames = val;
  CATEGORIES.forEach(({ key }) => { getCardSettings(key).minGames = val; });
  getCardSettings("vs_best").minGames = val;
  getCardSettings("vs_worst").minGames = val;
  fetchAndRender();
}

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

// ── ID normalisation ──────────────────────────────────────────────────────────
function normaliseId(rawId) {
  return String(Math.round(parseFloat(rawId)));
}

// ── Image helpers ─────────────────────────────────────────────────────────────
function resolveImages(type, rawId) {
  const id = normaliseId(rawId);
  if (type === 'item') return `<img src="${DDragon}/img/item/${id}.png" class="rec-icon" alt="" />`;
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
  if (type === 'summ') return rawId.split('/').map(s => summs[s.trim()] ?? s).join(', ');
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

function renderVsGrid(champs) {
  document.getElementById('vs-grid').innerHTML = champs.slice(0, 30).map(c => `
    <div class="champ-card champ-card-sm${selected.vs === c.name ? ' selected' : ''}"
         data-name="${c.name}" data-id="${c.id}" onclick="selectVs(this)">
      <img src="${DDragon}/img/champion/${c.id}.png" alt="${c.name}" loading="lazy" />
      <p class="champ-name">${c.name}</p>
    </div>
  `).join('');
}

function selectVs(el) {
  selected.vs = el.dataset.name;
  selected.vsId = el.dataset.id;
  document.getElementById('vs-search').style.display    = 'none';
  document.getElementById('vs-selected-display').style.display = 'flex';
  document.getElementById('vs-selected-img').src        = `${DDragon}/img/champion/${el.dataset.id}.png`;
  document.getElementById('vs-selected-name').textContent = el.dataset.name;
  document.getElementById('vs-clear').style.display     = 'inline-block';
  renderVsGrid([]);
}

function clearVs() {
  selected.vs = null;
  selected.vsId = null;
  document.getElementById('vs-search').style.display    = 'block';
  document.getElementById('vs-search').value            = '';
  document.getElementById('vs-selected-display').style.display = 'none';
  document.getElementById('vs-clear').style.display     = 'none';
  renderVsGrid([]);
}

function selectVsFromRow(name, id) {
  const champ = allChampions.find(c => c.name === name);
  if (!champ) return;
  selected.vs = name;
  selected.vsId = id;
  document.getElementById('vs-search').style.display    = 'none';
  document.getElementById('vs-selected-display').style.display = 'flex';
  document.getElementById('vs-selected-img').src        = `${DDragon}/img/champion/${champ.id}.png`;
  document.getElementById('vs-selected-name').textContent = name;
  document.getElementById('vs-clear').style.display     = 'inline-block';
  fetchAndRender();
}

document.getElementById('search').addEventListener('input', e => {
  const q = e.target.value.toLowerCase();
  renderGrid(q ? allChampions.filter(c => c.name.toLowerCase().includes(q)) : allChampions);
});

document.getElementById('vs-search').addEventListener('input', e => {
  const q = e.target.value.toLowerCase();
  renderVsGrid(q ? allChampions.filter(c => c.name.toLowerCase().includes(q)) : []);
});

// delegated listener for matchup rows (avoids inline onclick with special chars)
document.getElementById('results-inner').addEventListener('click', e => {
  const row = e.target.closest('[data-vs-name]');
  if (!row) return;
  selectVsFromRow(row.dataset.vsName, row.dataset.vsId);
});

function selectChampion(el) {
  selected.championId = el.dataset.id;
  selected.champion   = el.dataset.name;
  selectedBuild       = {};
  document.querySelectorAll('.champ-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('hero-portrait').src        = `${DDragon}/img/champion/${selected.championId}.png`;
  document.getElementById('hero-name').textContent    = selected.champion;
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

// ── Build params ──────────────────────────────────────────────────────────────
function buildParams(extra = {}, buildOverride = selectedBuild) {
  const raw = {
    champ: selected.championId,
    role:  selected.role,
    tier:  selected.rank,
    vs:    selected.vsId,
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
  const { [key]: _, ...buildWithoutKey } = selectedBuild;
  const { minGames: mg } = getCardSettings(key);
  const params = buildParams({ key, k: TOP_K, min_games: mg }, buildWithoutKey);
  const res    = await fetch(`${API_BASE}/top?${params}`);
  const data   = await res.json();
  if (data.error) throw new Error(data.error);

  const normalised = {};
  for (const [rawId, stats] of Object.entries(data)) {
    const normKey = key === 'summs' ? rawId : normaliseId(rawId);
    normalised[normKey] = { ...stats };
  }

  return Object.entries(normalised)
    .map(([rawId, stats]) => ({ rawId, ...stats }))
    .sort((a, b) => b.winrate - a.winrate);
}

async function fetchMatchups() {
  const { minGames: mg_best } = getCardSettings('vs_best');
  const params_b = buildParams({ key: 'vs', k: 5, min_games: mg_best });
  const res_b    = await fetch(`${API_BASE}/top?${params_b}`);
  const data_b   = await res_b.json();

  let best_rows = [];
  let worst_rows = [];
  
  if (data_b.error) {
    best_rows = [];
  } else {
    const rows_b = Object.entries(data_b)
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((a, b) => b.winrate - a.winrate);
    best_rows = rows_b.slice(0, 5);
  }

  const { minGames: mg_worst } = getCardSettings('vs_worst');
  const params_w = buildParams({ key: 'vs', k: 180, min_games: mg_worst });
  const res_w    = await fetch(`${API_BASE}/top?${params_w}`);
  const data_w   = await res_w.json();
  if (data_w.error) {
    worst_rows = [];
  } else {
    const rows_w = Object.entries(data_w)
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((a, b) => b.winrate - a.winrate);
    worst_rows = rows_w.slice(-5);
  }
  
  return { best: best_rows, worst: worst_rows };
}

async function fetchAndRender() {
  if (!selected.champion) return;
  const inner = document.getElementById('results-inner');
  document.getElementById('results').classList.add('visible');
  inner.innerHTML = '<div class="spinner">Calculating win probabilities</div>';

  try {
    const [base, matchups, ...topResults] = await Promise.all([
      fetchWinrate(),
      fetchMatchups(),
      ...CATEGORIES.map(cat => fetchTop(cat.key))
    ]);
    renderResults(base, matchups, topResults);
  } catch (e) {
    inner.innerHTML = `<div class="error-msg">Error: ${e.message}</div>`;
  }
}

document.getElementById('get-btn').addEventListener('click', () => {
  selectedBuild = {};
  fetchAndRender();
  document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
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

// ── Global Card controls HTML helper ─────────────────────────────────────────────────
function globalControlsHtml() {
  const { sortBy: gs, minGames: gm } = globalCardSettings;
  return `
    <div class="global-controls">
      <span class="global-controls-label">All Sections</span>
      <div class="card-control-group">
        <span class="card-control-label">Sort</span>
        <button class="mini-pill${gs === 'winrate' ? ' active' : ''}" onclick="setAllSort('winrate')">WR</button>
        <button class="mini-pill${gs === 'games'   ? ' active' : ''}" onclick="setAllSort('games')">Games</button>
      </div>
      <div class="card-control-group">
        <span class="card-control-label">Min Games</span>
        ${[5,10,25,50,100].map(n =>
          `<button class="mini-pill${gm === n ? ' active' : ''}" onclick="setAllMin(${n})">${n}</button>`
        ).join('')}
      </div>
    </div>`;
}

// ── Card controls HTML helper ─────────────────────────────────────────────────
function cardControlsHtml(key) {
  const { sortBy: cs, minGames: cm } = getCardSettings(key);
  if (key == "vs_best" || key == "vs_worst") {
    return `
      <div class="card-controls">
        <div class="card-control-group">
          <span class="card-control-label">Min</span>
          ${[5,10,25,50,100].map(n =>
            `<button class="mini-pill${cm === n ? ' active' : ''}" onclick="setCardMin('${key}', ${n})">${n}</button>`
          ).join('')}
        </div>
      </div>`;
  } else {
    return `
      <div class="card-controls">
        <div class="card-control-group">
          <span class="card-control-label">Sort</span>
          <button class="mini-pill${cs === 'winrate' ? ' active' : ''}" onclick="setCardSort('${key}', 'winrate')">WR</button>
          <button class="mini-pill${cs === 'games'   ? ' active' : ''}" onclick="setCardSort('${key}', 'games')">Games</button>
        </div>
        <div class="card-control-group">
          <span class="card-control-label">Min</span>
          ${[5,10,25,50,100].map(n =>
            `<button class="mini-pill${cm === n ? ' active' : ''}" onclick="setCardMin('${key}', ${n})">${n}</button>`
          ).join('')}
        </div>
      </div>`;
  }
}

// ── Render matchups ───────────────────────────────────────────────────────────
function renderMatchups(matchups, baseWr) {
  if (!matchups.best.length && !matchups.worst.length) return '';

  // always sort matchups by winrate
  const sortedBest  = [...matchups.best].sort((a, b) => b.winrate - a.winrate);
  const sortedWorst = [...matchups.worst].sort((a, b) => a.winrate - b.winrate);

  const makeRow = (row, i) => {
    const champ = allChampions.find(c => c.id === row.name);
    row.name = champ ? champ.name : row.name;
    const img   = champ ? `<img src="${DDragon}/img/champion/${champ.id}.png" class="rec-icon" alt="" />` : '';
    const wr    = row.winrate * 100;
    const delta = wr - baseWr;
    const dCls  = delta > 0.5 ? 'pos' : delta < -0.5 ? 'neg' : 'neu';
    const dStr  = (delta >= 0 ? '+' : '') + delta.toFixed(1) + '%';
    // use data attribute to safely handle special champion names
    return `
      <div class="rec-row" data-vs-name="${row.name.replace(/"/g, '&quot;')}">
        <span class="rec-rank">${i}</span>
        <div class="rec-icons">${img}</div>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="rec-name">${row.name}</span>
            <span class="rec-games">${row.wins}/${row.games} games</span>
            <span class="rec-wr">${wr.toFixed(1)}%</span>
            <span class="rec-delta ${dCls}">${dStr}</span>
          </div>
        </div>
      </div>`;
  };

  return `
    <div class="rec-grid" style="margin-bottom:24px;">
      <div class="rec-card">
        <p class="rec-title">Best matchups</p>
        ${cardControlsHtml('vs_best')}
        ${sortedBest.map((r, i) => makeRow(r, i + 1)).join('')}
      </div>
      <div class="rec-card">
        <p class="rec-title">Worst matchups</p>
        ${cardControlsHtml('vs_worst')}
        ${sortedWorst.map((r, i) => makeRow(r, i + 1)).join('')}
      </div>
    </div>`;
}

// ── Render results ────────────────────────────────────────────────────────────
function renderResults(base, matchups, topResults) {
  const inner   = document.getElementById('results-inner');
  const filters = [selected.champion];
  if (selected.role) filters.push(selected.role);
  if (selected.rank) filters.push(selected.rank);
  if (selected.vs)   filters.push(`vs ${selected.vs}`);

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
        <p class="wr-games">${base.wins} / ${base.games} games</p>
      </div>`;
  }

  const baseWr = base.games > 0 ? base.winrate * 100 : 50;

  const cards = CATEGORIES.map(({ key, label, type }, ci) => {
    const rows = topResults[ci];
    if (!rows || rows.length === 0) return '';

    const maxWr    = Math.max(...rows.map(r => r.winrate));
    const chosenId = selectedBuild[key] ?? null;
    const { sortBy: cs } = getCardSettings(key);

    const sortedRows = [...rows].sort((a, b) =>
      cs === 'games' ? b.games - a.games : b.winrate - a.winrate
    );

    const rowsHtml = sortedRows.map((row, i) => {
      const normId   = key === 'summs' ? row.rawId : normaliseId(row.rawId);
      const isChosen = normId === chosenId;
      const wr       = row.winrate * 100;
      const delta    = wr - baseWr;
      const dCls     = delta > 0.5 ? 'pos' : delta < -0.5 ? 'neg' : 'neu';
      const dStr     = (delta >= 0 ? '+' : '') + delta.toFixed(1) + '%';
      const barPct   = (row.winrate / maxWr * 100).toFixed(1);
      const imgs     = resolveImages(type, row.rawId);
      const name     = resolveName(type, row.rawId);
      return `
        <div class="rec-row${isChosen ? ' chosen' : ''}" onclick="toggleBuildChoice('${key}', '${row.rawId}')">
          <span class="rec-rank">${i + 1}</span>
          <div class="rec-icons">${imgs}</div>
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:8px;">
              <span class="rec-name">${name}</span>
              <span class="rec-games">${row.wins}/${row.games} games</span>
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
        ${cardControlsHtml(key)}
        ${rowsHtml}
      </div>`;
  }).join('');

  const globalControls = globalControlsHtml();
  // hide matchups when a vs is already selected — they become irrelevant
  const matchupsHtml = selected.vs ? '' : renderMatchups(matchups, baseWr);
  inner.innerHTML = heroHtml + globalControls + matchupsHtml + `<div class="rec-grid">${cards}</div>`;
}

// ── Init ──────────────────────────────────────────────────────────────────────
Promise.all([loadChampions(), loadRuneIcons(), loadSummIcons()]);