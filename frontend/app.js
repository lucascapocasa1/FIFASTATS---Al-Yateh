const API_URL = 'http://localhost:3001/api';
const FETCH_TIMEOUT = 30000;

const POSITIONS = [
  { id: '', label: '— Sin posición' },
  { id: 'GK', label: 'GK - Arquero' },
  { id: 'DFCI', label: 'DFC Izquierdo' },
  { id: 'DFC', label: 'DFC Central (Libero)' },
  { id: 'DFCD', label: 'DFC Derecho' },
  { id: 'MCD', label: 'MCD - 5 (Tapón)' },
  { id: 'MD', label: 'MD - Extremo Derecho' },
  { id: 'MI', label: 'MI - Extremo Izquierdo' },
  { id: 'MCI', label: 'MCI - Medio Centro Izquierdo' },
  { id: 'MCR', label: 'MCR - Mediocentro Derecho' },
  { id: 'DC', label: 'DC - Delantero Centro' },
];

async function fetchWithTimeout(url, options = {}, timeout = FETCH_TIMEOUT) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(id);
  }
}

const state = {
  files: [],
  results: [],
  history: [],
  processing: false
};

let dashChart = null;
let rankingData = [];
let rankingSortKey = null;
let rankingSortAsc = true;

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initDropzone();
  initButtons();
  initTheme();
  initDashboard();
  initDashboardChartType();
  initRanking();
  loadMatchHistory();
  initTimeline();
  setDefaultDate();
});

function setDefaultDate() {
  document.getElementById('match-fecha').value = new Date().toISOString().split('T')[0];
}

// ── Tabs ──
function initTabs() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${tab}`).classList.add('active');
      if (tab === 'history') { loadMatchHistory(); initTimeline(); }
      if (tab === 'dashboard') {
        const sel = document.getElementById('dash-player');
        if (sel.value) loadDashboardPlayerStats(sel.value);
      }
      if (tab === 'ranking') loadRanking();
    });
  });
}

// ── Theme ──
function initTheme() {
  const saved = localStorage.getItem('fifa-theme');
  if (saved === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
    document.getElementById('theme-toggle').textContent = '🌙';
  }
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
}

function toggleTheme() {
  const html = document.documentElement;
  const btn = document.getElementById('theme-toggle');
  if (html.getAttribute('data-theme') === 'light') {
    html.removeAttribute('data-theme');
    btn.textContent = '☀️';
    localStorage.setItem('fifa-theme', 'dark');
  } else {
    html.setAttribute('data-theme', 'light');
    btn.textContent = '🌙';
    localStorage.setItem('fifa-theme', 'light');
  }
  if (dashChart) updateChartColors();
}

function updateChartColors() {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const textColor = isLight ? '#1a1d27' : '#e8eaf6';
  const gridColor = isLight ? '#d0d4dc' : '#2e3350';
  if (dashChart) {
    dashChart.options.plugins.legend.labels.color = textColor;
    dashChart.options.scales.x.ticks.color = textColor;
    dashChart.options.scales.x.grid.color = gridColor;
    dashChart.options.scales.y.ticks.color = textColor;
    dashChart.options.scales.y.grid.color = gridColor;
    dashChart.update();
  }
}

// ── Dropzone ──
function initDropzone() {
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');

  dropzone.addEventListener('dragover', e => {
    e.preventDefault();
    dropzone.classList.add('drag-over');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
  dropzone.addEventListener('drop', e => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
    addFiles(Array.from(e.dataTransfer.files));
  });
  dropzone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    addFiles(Array.from(fileInput.files));
    fileInput.value = '';
  });
}

function addFiles(newFiles) {
  console.log('[addFiles] Llamado con', newFiles.length, 'archivos, type:', newFiles[0]?.type);

  // Si está procesando, ignorar (evita que se borren los resultados)
  if (state.processing) {
    console.log('[addFiles] BLOQUEADO: state.processing = true');
    return;
  }

  const imageFiles = newFiles.filter(f => f.type.startsWith('image/'));
  if (!imageFiles.length) { toast('Solo se aceptan imágenes', 'error'); return; }

  state.files = [...state.files, ...imageFiles];
  renderPreviews();

  document.getElementById('results-card').style.display = 'none';
  document.getElementById('save-all-row').style.display = 'none';
  state.results = [];
  state._matchId = null;
  console.log('[addFiles] Resultados limpiados, results-card ocultado');
}

function renderPreviews() {
  const grid = document.getElementById('preview-grid');
  const card = document.getElementById('preview-card');
  const count = document.getElementById('img-count');

  if (!state.files.length) {
    card.style.display = 'none';
    return;
  }

  card.style.display = 'block';
  count.textContent = state.files.length;
  grid.innerHTML = '';

  const posOpts = POSITIONS.map(p =>
    `<option value="${p.id}">${p.label}</option>`
  ).join('');

  state.files.forEach((file, i) => {
    const url = URL.createObjectURL(file);
    const pos = state.files[i]._posicion || '';
    const div = document.createElement('div');
    div.className = 'preview-item';
    div.draggable = true;
    div.dataset.index = i;
    div.innerHTML = `
      <div class="preview-drag-handle">⠿</div>
      <img src="${url}" alt="${file.name}" />
      <div class="preview-name">${file.name}</div>
      <button class="preview-remove" title="Quitar" data-index="${i}">✕</button>
      <div class="preview-position-row">
        <span class="preview-position-label">Pos:</span>
        <select class="preview-position-select" data-index="${i}">
          ${posOpts.replace(`value="${pos}"`, `value="${pos}" selected`)}
        </select>
      </div>
    `;
    grid.appendChild(div);

    div.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', i);
      div.classList.add('dragging');
    });
    div.addEventListener('dragend', () => div.classList.remove('dragging'));
    div.addEventListener('dragover', e => {
      e.preventDefault();
      div.classList.add('drag-over');
    });
    div.addEventListener('dragleave', () => div.classList.remove('drag-over'));
    div.addEventListener('drop', e => {
      e.preventDefault();
      div.classList.remove('drag-over');
      const fromIdx = parseInt(e.dataTransfer.getData('text/plain'));
      const toIdx = parseInt(div.dataset.index);
      if (fromIdx !== toIdx) {
        const [moved] = state.files.splice(fromIdx, 1);
        state.files.splice(toIdx, 0, moved);
        renderPreviews();
      }
    });
  });

  grid.querySelectorAll('.preview-remove').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.index);
      state.files.splice(idx, 1);
      renderPreviews();
    });
  });

  grid.querySelectorAll('.preview-position-select').forEach(sel => {
    sel.addEventListener('change', e => {
      const idx = parseInt(e.target.dataset.index);
      state.files[idx]._posicion = e.target.value;
    });
  });
}

// ── Buttons ──
function initButtons() {
  document.getElementById('btn-clear').addEventListener('click', () => {
    state.files = [];
    state.results = [];
    state._matchId = null;
    renderPreviews();
    document.getElementById('results-card').style.display = 'none';
  });

  document.getElementById('btn-process').addEventListener('click', processImages);
  document.getElementById('btn-save-all').addEventListener('click', saveAllPlayers);
  document.getElementById('btn-refresh').addEventListener('click', loadMatchHistory);
  document.getElementById('btn-rank-refresh').addEventListener('click', loadRanking);

  const searchInput = document.getElementById('history-search');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      if (state.history.length) renderFilteredHistory();
    });
  }
}

// ── Process Images ──
async function processImages() {
  if (!state.files.length) { toast('Seleccioná al menos una imagen', 'error'); return; }
  console.log('[processImages] Iniciando con', state.files.length, 'archivos');

  if (!document.getElementById('match-rival').value.trim()) {
    toast('Ingresá el nombre del rival', 'error');
    return;
  }

  state.processing = true;
  state._matchId = null;
  showOverlay('Procesando imágenes con OCR...', 'Esto puede tardar unos segundos por imagen');
  document.getElementById('btn-process').disabled = true;

  // Deshabilitar el drag/drop/clic para evitar re-entrada
  const dropzone = document.getElementById('dropzone');
  dropzone.style.pointerEvents = 'none';
  const fileInput = document.getElementById('fileInput');
  fileInput.disabled = true;

  try {
    const formData = new FormData();
    state.files.forEach(f => formData.append('images', f));
    console.log('[processImages] Enviando', state.files.length, 'imágenes al servidor...');

    const response = await fetchWithTimeout(`${API_URL}/upload`, {
      method: 'POST',
      body: formData
    }, 120000);

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || `Error HTTP ${response.status}`);
    }

    const data = await response.json();
    state.results = data.results;
    // Car gar posición desde los archivos a los resultados
    state.results.forEach((r, i) => {
      if (r.data && state.files[i] && state.files[i]._posicion) {
        r.data.posicion = state.files[i]._posicion;
      }
    });
    console.log('[processImages] Respuesta del servidor:', { total: data.total, exitosos: data.exitosos, fallidos: data.fallidos });
    console.log('[processImages] state.results.length =', state.results.length);
    data.results.forEach((r, i) => {
      console.log(`[processImages] Resultado #${i}:`, r.filename, 'success:', r.success, 'jugador:', r.data?.jugador, 'pos:', r.data?.posicion);
    });

    console.log('[processImages] Llamando a renderResults...');
    renderResults(data);
    console.log('[processImages] renderResults completado');

  } catch (err) {
    console.error(err);
    toast(`Error: ${err.message}`, 'error');
  } finally {
    state.processing = false;
    hideOverlay();
    document.getElementById('btn-process').disabled = false;
    document.getElementById('dropzone').style.pointerEvents = '';
    document.getElementById('fileInput').disabled = false;
  }
}

// ── Render Results ──
function renderResults(data) {
  console.log('[renderResults] Iniciando render, results.length =', data.results?.length);
  const card = document.getElementById('results-card');
  const list = document.getElementById('results-list');
  const meta = document.getElementById('results-meta');

  if (!card) { console.error('[renderResults] #results-card NO EXISTE en el DOM'); return; }
  if (!list) { console.error('[renderResults] #results-list NO EXISTE en el DOM'); return; }

  card.style.display = 'block';
  meta.textContent = `${data.exitosos} exitosos / ${data.fallidos} fallidos de ${data.total}`;

  list.innerHTML = '';
  console.log('[renderResults] Card visible, list vaciado');

  data.results.forEach((result, idx) => {
    const hasData = result.success && result.data;
    const hasWarnings = result.warnings && result.warnings.length > 0;
    const statusClass = !result.success ? 'error' : hasWarnings ? 'warning' : 'ok';

    const div = document.createElement('div');
    div.className = result.success && result.data ? 'result-item expanded' : 'result-item';
    div.innerHTML = `
      <div class="result-header" data-idx="${idx}">
        <span class="result-status ${statusClass}"></span>
        <span class="result-filename">${result.filename}</span>
        ${hasData ? `<span class="result-player">👤 ${result.data.jugador}</span>` : ''}
        <span class="result-arrow">▾</span>
      </div>
      <div class="result-body">
        ${renderResultBody(result, idx)}
      </div>
    `;
    console.log('[renderResults] Append child #' + idx + ':', result.filename);
    list.appendChild(div);

    div.querySelector('.result-header').addEventListener('click', () => {
      div.classList.toggle('expanded');
    });
  });

  console.log('[renderResults] Elementos agregados al DOM:', list.children.length);

  list.addEventListener('change', handleStatInputChange);

  const successfulResults = data.results.filter(r => r.success && r.data);
  if (successfulResults.length > 0) {
    document.getElementById('save-all-row').style.display = 'flex';
  }

  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  console.log('[renderResults] Finalizado, card visible:', card.style.display);
}

function handleStatInputChange(e) {
  const input = e.target;
  if (!input.dataset.resultIdx || !input.dataset.stat) return;
  const idx = parseInt(input.dataset.resultIdx);
  const stat = input.dataset.stat;
  const val = input.type === 'number' ? (input.value === '' ? null : parseFloat(input.value)) : input.value;
  if (state.results[idx] && state.results[idx].data) {
    state.results[idx].data[stat] = val;
  }
}

function renderResultBody(result, idx) {
  if (!result.success) {
    return `
      <ul class="error-list">
        ${result.errors.map(e => `<li>${e}</li>`).join('')}
      </ul>
    `;
  }

  const d = result.data;
  let html = '';

  if (result.warnings && result.warnings.length) {
    html += `<div class="warning-box">⚠ ${result.warnings.join(' | ')}</div>`;
  }

  // Player name editable
  html += `
    <div class="stat-cell player-name-cell">
      <div class="stat-label">👤 Jugador</div>
      <input type="text" class="stat-input" value="${d.jugador || ''}"
        data-result-idx="${idx}" data-stat="jugador" />
    </div>
  `;

  // Position selector
  const posOpts = POSITIONS.map(p =>
    `<option value="${p.id}" ${d.posicion === p.id ? 'selected' : ''}>${p.label}</option>`
  ).join('');
  html += `
    <div class="stat-cell" style="grid-column:1/-1">
      <div class="stat-label">📌 Posición</div>
      <select class="stat-input" data-result-idx="${idx}" data-stat="posicion">
        ${posOpts}
      </select>
    </div>
  `;

  const statsConfig = [
    { key: 'valoracion',           label: 'Valoración',            emoji: '⭐', step: 0.1 },
    { key: 'goles',                label: 'Goles',                 emoji: '⚽', step: 1 },
    { key: 'asistencias',          label: 'Asistencias',           emoji: '🎯', step: 1 },
    { key: 'tiros',                label: 'Tiros',                 emoji: '🏃', step: 1 },
    { key: 'precision_tiros',      label: 'Precisión tiros %',     emoji: '🎯', step: 1 },
    { key: 'pases',                label: 'Pases',                 emoji: '↗', step: 1 },
    { key: 'precision_pases',      label: 'Precisión pases %',     emoji: '✅', step: 1 },
    { key: 'regates',              label: 'Regates',               emoji: '💫', step: 1 },
    { key: 'exito_regates',        label: 'Éxito regates %',       emoji: '🔥', step: 1 },
    { key: 'entradas',             label: 'Entradas',              emoji: '🛡', step: 1 },
    { key: 'exito_entradas',       label: 'Éxito entradas %',      emoji: '✔', step: 1 },
    { key: 'fueras_de_juego',      label: 'Fueras de lugar',       emoji: '🚩', step: 1 },
    { key: 'faltas',               label: 'Faltas',                emoji: '❌', step: 1 },
    { key: 'posesion_ganada',      label: 'Posesión ganada',       emoji: '🟢', step: 1 },
    { key: 'posesion_perdida',     label: 'Posesión perdida',      emoji: '🔴', step: 1 },
    { key: 'minutos_jugados',      label: 'Minutos',               emoji: '⏱', step: 1 },
    { key: 'distancia_recorrida_km', label: 'Dist. recorrida km',  emoji: '📏', step: 0.1 },
    { key: 'distancia_sprint_km',  label: 'Dist. sprint km',       emoji: '⚡', step: 0.1 },
  ];

  html += '<div class="stats-grid">';
  for (const s of statsConfig) {
    const val = d[s.key];
    const isNull = val === null || val === undefined;
    const inputVal = isNull ? '' : val;
    html += `
      <div class="stat-cell">
        <div class="stat-label">${s.emoji} ${s.label}</div>
        <input type="number" class="stat-input ${isNull ? 'null-val' : ''}"
          step="${s.step}" min="0" max="${s.key === 'valoracion' ? 10 : 99999}"
          value="${inputVal}" placeholder="—"
          data-result-idx="${idx}" data-stat="${s.key}" />
      </div>
    `;
  }
  html += '</div>';

  if (result.ocr_debug) {
    html += `
      <div class="ocr-debug">
        <details>
          <summary>🔍 Ver texto OCR extraído (debug)</summary>
          <pre><strong>Nombre:</strong>\n${result.ocr_debug.name_text || ''}\n\n<strong>Stats panel:</strong>\n${result.ocr_debug.stats_text || ''}</pre>
        </details>
      </div>
    `;
  }

  return html;
}

// ── Save all players ──
const SAVE_CONCURRENCY = 3;

async function saveAllPlayers() {
  const valid = state.results.filter(r => r.success && r.data && !r._saved);
  if (!valid.length) { toast('Todos los jugadores ya están guardados', 'info'); return; }

  const rival = document.getElementById('match-rival').value.trim();
  const descripcion = document.getElementById('match-desc').value.trim();
  const fecha = document.getElementById('match-fecha').value;

  if (!rival) { toast('Falta el nombre del rival', 'error'); return; }
  if (!fecha) { toast('Falta la fecha del partido', 'error'); return; }

  showOverlay('Guardando...', `0/${valid.length}`);

  try {
    // 1. Crear el partido (una sola vez)
    let matchId = state._matchId;
    if (!matchId) {
      const goles_favor = parseInt(document.getElementById('match-gf').value) || 0;
      const goles_contra = parseInt(document.getElementById('match-gc').value) || 0;
      const matchRes = await fetchWithTimeout(`${API_URL}/match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rival, descripcion, fecha, goles_favor, goles_contra })
      }, 10000);
      const matchData = await matchRes.json();
      if (!matchData.success) throw new Error('Error creando partido');
      matchId = matchData.id;
      state._matchId = matchId;
    }

    // 2. Guardar jugadores en paralelo con límite de concurrencia
    let savedCount = 0;
    let hasError = false;

    for (let i = 0; i < valid.length; i += SAVE_CONCURRENCY) {
      const batch = valid.slice(i, i + SAVE_CONCURRENCY);
      const batchResults = await Promise.allSettled(
        batch.map(async (r) => {
          const idx = state.results.indexOf(r);
          const saveRes = await fetchWithTimeout(`${API_URL}/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stats: r.data, match_id: matchId })
          }, 15000);
          const saveData = await saveRes.json();
          if (!saveRes.ok) throw new Error(saveData.error || 'Error guardando');
          r._saved = true;
          r._savedId = saveData.id;
        })
      );

      for (const res of batchResults) {
        if (res.status === 'fulfilled') {
          savedCount++;
        } else {
          hasError = true;
          console.error('[saveAllPlayers] Error:', res.reason);
        }
      }

      document.getElementById('overlay-sub').textContent = `${savedCount}/${valid.length}`;
    }

    if (hasError) {
      toast(`✅ ${savedCount} guardados, pero algunos fallaron`, 'warning');
    } else {
      toast(`✅ ${savedCount} jugador(es) guardado(s)`, 'success');
    }

  } catch (err) {
    toast(`Error: ${err.message}`, 'error');
  } finally {
    hideOverlay();
  }
}

// ── Match History ──
async function loadMatchHistory() {
  const container = document.getElementById('history-container');
  container.innerHTML = '<div class="empty-state"><span class="empty-icon">⏳</span><p>Cargando...</p></div>';

  try {
    const response = await fetchWithTimeout(`${API_URL}/matches`);
    const data = await response.json();

    state.history = data.data || [];

    if (!state.history.length) {
      container.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">📊</span>
          <p>No hay partidos guardados todavía.</p>
        </div>`;
      return;
    }

    renderFilteredHistory();

  } catch (err) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">❌</span>
        <p>Error cargando datos: ${err.message}</p>
        <p style="margin-top:8px;font-size:12px;color:var(--text-dim)">Asegurate que el backend esté corriendo en localhost:3001</p>
      </div>`;
  }
}

function renderFilteredHistory() {
  const query = (document.getElementById('history-search').value || '').toLowerCase().trim();
  const filtered = query
    ? state.history.filter(m => (m.rival || '').toLowerCase().includes(query))
    : state.history;
  const container = document.getElementById('history-container');
  renderMatchHistory(filtered, container);
}

async function renderMatchHistory(matches, container) {
  const fragment = document.createDocumentFragment();

  for (const match of matches) {
    const card = document.createElement('div');
    card.className = 'match-card';

    const fecha = match.fecha ? new Date(match.fecha + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';

    const gf = match.goles_favor != null ? match.goles_favor : -1;
    const gc = match.goles_contra != null ? match.goles_contra : -1;
    const hasResult = gf >= 0 && gc >= 0;
    const resultClass = hasResult ? (gf > gc ? 'win' : gf < gc ? 'lose' : 'draw') : '';
    const resultHtml = hasResult
      ? `<span class="match-result-badge ${resultClass}">${gf}-${gc}</span>`
      : '';

    card.innerHTML = `
      <div class="match-header" data-match-id="${match.id}">
        <div class="match-info">
          <span class="match-rival">🆚 ${match.rival}</span>
          <span class="match-date">${fecha}</span>
          ${match.descripcion ? `<span class="match-desc">${match.descripcion}</span>` : ''}
        </div>
        <div class="match-meta">
          ${resultHtml}
          <span class="match-players">👥 ${match.jugadores} jug.</span>
          <button class="btn btn-danger btn-sm match-delete-btn" data-match-id="${match.id}" title="Eliminar partido">✕</button>
          <span class="result-arrow">▾</span>
        </div>
      </div>
      <div class="match-body">
        <div class="match-players-list"></div>
      </div>
    `;

    fragment.appendChild(card);
  }

  container.innerHTML = '';
  container.appendChild(fragment);

  // Delete match buttons
  container.querySelectorAll('.match-delete-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const matchId = btn.dataset.matchId;
      if (!confirm('¿Eliminar este partido y todas sus estadísticas?')) return;
      try {
        const res = await fetchWithTimeout(`${API_URL}/match/${matchId}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
          toast('Partido eliminado', 'info');
          loadMatchHistory();
        } else {
          toast('Error eliminando: ' + (data.error || 'desconocido'), 'error');
        }
      } catch (err) {
        toast('Error: ' + err.message, 'error');
      }
    });
  });

  // Load match details on click
  container.querySelectorAll('.match-header').forEach(header => {
    header.addEventListener('click', async () => {
      const card = header.closest('.match-card');
      const body = card.querySelector('.match-body');
      const list = body.querySelector('.match-players-list');
      const isOpen = body.style.display === 'block';

      if (isOpen) {
        body.style.display = 'none';
        return;
      }

      if (list.children.length === 0) {
        const matchId = header.dataset.matchId;
        list.innerHTML = '<div class="empty-state"><p>Cargando...</p></div>';
        body.style.display = 'block';

        try {
          const res = await fetchWithTimeout(`${API_URL}/match/${matchId}`);
          const data = await res.json();
          if (data.data && data.data.stats) {
            renderMatchPlayers(list, data.data.stats, matchId, data.data);
          } else {
            list.innerHTML = '<div class="empty-state"><p>Sin datos</p></div>';
          }
        } catch (err) {
          list.innerHTML = `<div class="empty-state"><p>Error: ${err.message}</p></div>`;
        }
      } else {
        body.style.display = 'block';
      }
    });
  });
}

const HISTORY_STAT_FIELDS = [
  { key: 'jugador', label: 'Jugador', type: 'text' },
  { key: 'valoracion', label: 'Val', type: 'number', step: 0.1, min: 0, max: 10 },
  { key: 'goles', label: 'G', type: 'number', step: 1, min: 0 },
  { key: 'asistencias', label: 'A', type: 'number', step: 1, min: 0 },
  { key: 'pases', label: 'Pases', type: 'number', step: 1, min: 0 },
  { key: 'precision_pases', label: 'Prec.%', type: 'number', step: 1, min: 0, max: 100 },
  { key: 'tiros', label: 'Tiros', type: 'number', step: 1, min: 0 },
  { key: 'regates', label: 'Reg.', type: 'number', step: 1, min: 0 },
  { key: 'entradas', label: 'Entr.', type: 'number', step: 1, min: 0 },
];

function renderMatchPlayers(container, stats, matchId, matchInfo) {
  if (!stats.length) {
    container.innerHTML = '<div class="empty-state"><p>Sin jugadores en este partido</p></div>';
    return;
  }

  // Determinar MVP (mayor valoración, random si empate)
  let maxVal = -1;
  let mvps = [];
  for (const s of stats) {
    const v = s.valoracion != null ? s.valoracion : -1;
    if (v > maxVal) { maxVal = v; mvps = [s.jugador]; }
    else if (v === maxVal && v >= 0) { mvps.push(s.jugador); }
  }
  const mvpName = mvps.length > 0 ? mvps[Math.floor(Math.random() * mvps.length)] : null;

  container.innerHTML = '';
  statsCache.length = 0;
  statsCache.push(...stats);

  // Match Report (pitch + facts)
  const report = renderMatchReport(stats, mvpName, matchInfo);
  container.appendChild(report);

  // Stats table
  const table = document.createElement('div');
  table.className = 'match-stats-table';
  table.innerHTML = buildMatchTable(stats, mvpName);
  container.appendChild(table);

  // Player links in table
  table.querySelectorAll('.player-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.stopPropagation();
      const name = link.dataset.player;
      if (name) openPlayerPage(name);
    });
  });

  const editRow = document.createElement('div');
  editRow.className = 'match-edit-row';
  editRow.innerHTML = `
    <button class="btn btn-sm btn-ghost btn-edit-match">✏️ Editar jugadores</button>
    <button class="btn btn-sm btn-ghost btn-edit-match-data">📋 Editar partido</button>
  `;
  container.appendChild(editRow);

  editRow.querySelector('.btn-edit-match').addEventListener('click', () => {
    enterEditMode(container, stats, matchId, matchInfo);
  });

  editRow.querySelector('.btn-edit-match-data').addEventListener('click', () => {
    enterEditMatchMode(container, matchInfo || {}, matchId);
  });
}

function renderMatchReport(stats, mvpName, matchInfo) {
  const div = document.createElement('div');
  div.className = 'match-report';

  const mvpPlayer = stats.find(s => s.jugador === mvpName);

  // Compute highlights
  const topGoleador = stats.reduce((best, s) => (s.goles || 0) > ((best && best.goles) || 0) ? s : best, null);
  const topAsistente = stats.reduce((best, s) => (s.asistencias || 0) > ((best && best.asistencias) || 0) ? s : best, null);
  const topPases = stats.reduce((best, s) => (s.pases || 0) > ((best && best.pases) || 0) ? s : best, null);
  const avgVal = stats.reduce((sum, s) => sum + (s.valoracion || 0), 0) / stats.length;

  const fecha = matchInfo && matchInfo.fecha ? new Date(matchInfo.fecha + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';

  const gf = matchInfo && matchInfo.goles_favor != null ? matchInfo.goles_favor : -1;
  const gc = matchInfo && matchInfo.goles_contra != null ? matchInfo.goles_contra : -1;
  const hasResult = gf >= 0 && gc >= 0;
  const resultClass = hasResult ? (gf > gc ? 'win' : gf < gc ? 'lose' : 'draw') : '';
  const resultHtml = hasResult
    ? `<span class="match-result-badge ${resultClass}">${gf}-${gc}</span>`
    : '<span class="match-result-badge" style="color:var(--text-dim)">—</span>';

  div.innerHTML = `
    <div class="match-report-header">
      <div class="match-report-title">⚽ Resumen del Partido</div>
      <div class="match-report-meta" id="match-report-meta-${matchInfo?.id || '0'}">
        <span class="match-report-rival">🆚 ${matchInfo && matchInfo.rival ? matchInfo.rival : '—'}</span>
        <span class="match-report-fecha">📅 ${fecha}</span>
        <span class="match-report-result">${resultHtml}</span>
        <span>👥 ${stats.length} jug.</span>
      </div>
    </div>
    <div class="match-report-body">
      <div class="match-report-pitch">
        ${renderPitchView(stats, mvpName)}
      </div>
      <div class="match-report-facts">
        <div class="match-report-fact fact-mvp">
          <div class="fact-label">🏆 MVP</div>
          <div class="fact-value">${mvpPlayer ? mvpPlayer.jugador : '—'}</div>
          <div class="fact-sub">⭐ ${mvpPlayer && mvpPlayer.valoracion != null ? mvpPlayer.valoracion.toFixed(1) : '—'}</div>
        </div>
        <div class="match-report-fact">
          <div class="fact-label">⚽ Máx. Goleador</div>
          <div class="fact-value">${topGoleador && topGoleador.goles ? topGoleador.jugador : '—'}</div>
          <div class="fact-sub">${topGoleador ? (topGoleador.goles || 0) + ' gol' + (topGoleador.goles !== 1 ? 'es' : '') : ''}</div>
        </div>
        <div class="match-report-fact">
          <div class="fact-label">🎯 Máx. Asistente</div>
          <div class="fact-value">${topAsistente && topAsistente.asistencias ? topAsistente.jugador : '—'}</div>
          <div class="fact-sub">${topAsistente ? (topAsistente.asistencias || 0) + ' asist.' : ''}</div>
        </div>
        <div class="match-report-fact">
          <div class="fact-label">↗ Más Pases</div>
          <div class="fact-value">${topPases && topPases.pases ? topPases.jugador : '—'}</div>
          <div class="fact-sub">${topPases ? (topPases.pases || 0) + ' pases' : ''}</div>
        </div>
        <div class="match-report-fact">
          <div class="fact-label">⭐ Prom. Valoración</div>
          <div class="fact-value">${avgVal ? avgVal.toFixed(1) : '—'}</div>
          <div class="fact-sub">${stats.length} jugadores</div>
        </div>
        <div class="match-report-fact">
          <div class="fact-label">🏟️ Formación</div>
          <div class="fact-value">3-1-4-2</div>
          <div class="fact-sub">${stats.filter(s => s.posicion).length}/${stats.length} con posición</div>
        </div>
      </div>
    </div>
  `;

  return div;
}

function renderPitchView(stats, mvpName) {
  // Position coordinates for 3-1-4-2 on a 500x750 pitch
  const playerPos = {
    GK:  { x: 250, y: 680 },
    DFCI: { x: 110, y: 570 },
    DFC:  { x: 250, y: 570 },
    DFCD: { x: 390, y: 570 },
    MCD:  { x: 250, y: 450 },
    MI:   { x: 75,  y: 330 },
    MCI:  { x: 170, y: 330 },
    MCR:  { x: 330, y: 330 },
    MD:   { x: 425, y: 330 },
    DC:   { x: 0,   y: 0 }, // handled specially
  };

  let dcCount = 0;
  const markers = [];
  const unplaced = [];

  for (const s of stats) {
    const pos = s.posicion || '';
    let x, y;
    if (pos === 'DC') {
      dcCount++;
      x = dcCount === 1 ? 170 : 330;
      y = 200;
    } else if (playerPos[pos]) {
      x = playerPos[pos].x;
      y = playerPos[pos].y;
    } else {
      unplaced.push(s);
      continue;
    }
    markers.push({ ...s, x, y, isMvp: s.jugador === mvpName });
  }

  const ratingColor = (val) => {
    if (val == null) return { fill: 'rgba(128,128,128,0.25)', stroke: '#808080' };
    if (val >= 7.5) return { fill: 'rgba(0,230,118,0.25)', stroke: '#00e676' };
    if (val >= 6.0) return { fill: 'rgba(255,214,0,0.25)', stroke: '#ffd600' };
    return { fill: 'rgba(255,68,68,0.25)', stroke: '#ff4444' };
  };

  let svg = `<svg class="pitch-svg" viewBox="0 0 500 750" xmlns="http://www.w3.org/2000/svg">`;

  // MVP glow filter (must be before usage)
  svg += `<defs>`;
  svg += `<filter id="mvpGlow" x="-50%" y="-50%" width="200%" height="200%">`;
  svg += `<feGaussianBlur in="SourceAlpha" stdDeviation="4"/>`;
  svg += `<feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>`;
  svg += `</filter>`;
  svg += `</defs>`;

  // Field background
  svg += `<rect width="500" height="750" fill="#1b6b2e" rx="8"/>`;

  // Field markings
  svg += `<g stroke="rgba(255,255,255,0.40)" fill="none" stroke-width="1.5">`;
  svg += `<rect x="15" y="15" width="470" height="720" rx="2"/>`;
  svg += `<line x1="15" y1="375" x2="485" y2="375"/>`;
  svg += `<circle cx="250" cy="375" r="50"/>`;
  svg += `<circle cx="250" cy="375" r="3" fill="rgba(255,255,255,0.40)"/>`;
  svg += `<rect x="105" y="15" width="290" height="120"/>`;
  svg += `<rect x="105" y="615" width="290" height="120"/>`;
  svg += `<rect x="180" y="15" width="140" height="45"/>`;
  svg += `<rect x="180" y="690" width="140" height="45"/>`;
  svg += `<circle cx="250" cy="85" r="3" fill="rgba(255,255,255,0.40)"/>`;
  svg += `<circle cx="250" cy="665" r="3" fill="rgba(255,255,255,0.40)"/>`;
  svg += `<path d="M 180 85 A 70 70 0 0 0 320 85"/>`;
  svg += `<path d="M 180 665 A 70 70 0 0 1 320 665"/>`;
  svg += `</g>`;

  // Goals
  svg += `<g fill="rgba(255,255,255,0.50)">`;
  svg += `<rect x="218" y="0" width="64" height="12" rx="2"/>`;
  svg += `<rect x="218" y="738" width="64" height="12" rx="2"/>`;
  svg += `</g>`;

  // Players
  for (const p of markers) {
    const rc = ratingColor(p.valoracion);
    const valText = p.valoracion != null ? p.valoracion.toFixed(1) : '—';
    const tooltip = `${p.jugador || '?'} | ${p.posicion || '—'} | ⭐${valText}`;
    const mvpGlow = p.isMvp ? 'filter:url(#mvpGlow)' : '';
    const mvpStroke = p.isMvp ? '#ffd700' : rc.stroke;
    const mvpStrokeW = p.isMvp ? '3' : '2';

    svg += `<g class="player-group" transform="translate(${p.x}, ${p.y})" style="${mvpGlow}">`;
    svg += `<title>${tooltip}</title>`;
    svg += `<circle r="27" fill="${rc.fill}" stroke="${mvpStroke}" stroke-width="${mvpStrokeW}" class="player-ring"/>`;
    svg += `<text x="0" y="4" text-anchor="middle" fill="#fff" font-weight="700" font-size="14">${valText}</text>`;
    svg += `<text x="0" y="42" text-anchor="middle" fill="rgba(255,255,255,0.9)" font-size="11" font-weight="600" class="player-name">${p.jugador || '?'}</text>`;
    if (p.isMvp) {
      svg += `<text x="0" y="-32" text-anchor="middle" fill="#ffd700" font-size="16">👑</text>`;
    }
    svg += `</g>`;
  }

  svg += `</svg>`;

  let html = `<div class="pitch-container">${svg}</div>`;

  if (unplaced.length) {
    html += '<div class="pitch-unplaced">';
    html += '<div class="pitch-unplaced-title">Sin posición asignada:</div>';
    for (const p of unplaced) {
      html += `<span class="pos-badge">${p.jugador || '?'}</span>`;
    }
    html += '</div>';
  }

  return html;
}

function buildMatchTable(stats, mvpName) {
  if (!mvpName) {
    // Fallback: determine MVP if not provided
    let maxVal = -1;
    let mvps = [];
    for (const s of stats) {
      const v = s.valoracion != null ? s.valoracion : -1;
      if (v > maxVal) { maxVal = v; mvps = [s.jugador]; }
      else if (v === maxVal && v >= 0) { mvps.push(s.jugador); }
    }
    mvpName = mvps.length > 0 ? mvps[Math.floor(Math.random() * mvps.length)] : null;
  }

  let html = '<table><thead><tr>';
  html += '<th>Pos</th>';
  for (const f of HISTORY_STAT_FIELDS) {
    html += `<th>${f.label}</th>`;
  }
  html += '</tr></thead><tbody>';

  for (const s of stats) {
    const valClass = s.valoracion >= 7.5 ? 'high' : s.valoracion >= 6 ? 'mid' : 'low';
    const posLabel = s.posicion ? POSITIONS.find(p => p.id === s.posicion)?.label.split(' - ')[0] || s.posicion : '—';
    const isMvp = s.jugador === mvpName;
    html += `<tr class="${isMvp ? 'mvp-row' : ''}">`;
    html += `<td><span class="pos-badge">${posLabel}</span></td>`;
    html += `<td class="player-name"><a class="player-link" data-player="${s.jugador || ''}">${s.jugador || '—'}${isMvp ? ' 👑' : ''}</a></td>`;
    html += `<td><span class="rating-badge ${valClass}">${s.valoracion ?? '—'}</span></td>`;
    html += `<td>${s.goles ?? '—'}</td>`;
    html += `<td>${s.asistencias ?? '—'}</td>`;
    html += `<td>${s.pases ?? '—'}</td>`;
    html += `<td>${s.precision_pases ?? '—'}</td>`;
    html += `<td>${s.tiros ?? '—'}</td>`;
    html += `<td>${s.regates ?? '—'}</td>`;
    html += `<td>${s.entradas ?? '—'}</td>`;
    html += '</tr>';
  }

  html += '</tbody></table>';
  return html;
}

function enterEditMode(container, stats, matchId, matchInfo) {
  const posOpts = POSITIONS.map(p =>
    `<option value="${p.id}">${p.label}</option>`
  ).join('');

  let html = '<div class="match-stats-table"><table><thead><tr>';
  html += '<th>Pos</th><th>Jugador</th>';
  for (const f of HISTORY_STAT_FIELDS.slice(1)) {
    html += `<th>${f.label}</th>`;
  }
  html += '</tr></thead><tbody>';

  for (const s of stats) {
    html += '<tr>';
    html += `<td><select class="match-edit-input pos-input edit-pos" data-id="${s.id}">
      ${posOpts.replace(`value="${s.posicion || ''}"`, `value="${s.posicion || ''}" selected`)}
    </select></td>`;
    html += `<td><input class="match-edit-input edit-jugador" data-id="${s.id}" value="${s.jugador || ''}" /></td>`;
    for (const f of HISTORY_STAT_FIELDS.slice(1)) {
      const val = s[f.key];
      const inputVal = val !== null && val !== undefined ? val : '';
      html += `<td><input class="match-edit-input" data-id="${s.id}" data-key="${f.key}"
        type="${f.type}" step="${f.step || ''}" min="${f.min ?? ''}" max="${f.max ?? ''}"
        value="${inputVal}" /></td>`;
    }
    html += '</tr>';
  }

  html += '</tbody></table></div>';
  html += `<div class="match-edit-row">
    <button class="btn btn-sm btn-ghost btn-cancel-edit">Cancelar</button>
    <button class="btn btn-sm btn-success btn-save-edit">💾 Guardar cambios</button>
  </div>`;

  container.innerHTML = html;

  container.querySelector('.btn-cancel-edit').addEventListener('click', () => {
    renderMatchPlayers(container, stats, matchId, matchInfo);
  });

  container.querySelector('.btn-save-edit').addEventListener('click', async () => {
    const inputs = container.querySelectorAll('[data-id]');
    const updates = {};

    for (const inp of inputs) {
      const id = inp.dataset.id;
      if (!updates[id]) updates[id] = { id: parseInt(id) };
      if (inp.classList.contains('edit-jugador')) {
        updates[id].jugador = inp.value;
      } else if (inp.classList.contains('edit-pos')) {
        updates[id].posicion = inp.value;
      } else {
        const key = inp.dataset.key;
        const val = inp.value === '' ? null : parseFloat(inp.value);
        updates[id][key] = val;
      }
    }

    showOverlay('Guardando cambios...', '');
    let hasError = false;

    for (const entry of Object.values(updates)) {
      try {
        const res = await fetchWithTimeout(`${API_URL}/stats/${entry.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stats: entry })
        }, 15000);
        if (!res.ok) hasError = true;
      } catch {
        hasError = true;
      }
    }

    hideOverlay();

    if (hasError) {
      toast('Algunos cambios no se guardaron', 'error');
    } else {
      toast('Cambios guardados', 'success');
    }

    // Recargar datos del partido
    try {
      const res = await fetchWithTimeout(`${API_URL}/match/${matchId}`);
      const data = await res.json();
      if (data.data && data.data.stats) {
        renderMatchPlayers(container, data.data.stats, matchId, data.data);
      }
    } catch {
      toast('Error al recargar datos del partido', 'error');
    }
  });

  // Radar stat checkbox listeners
  document.querySelectorAll('.radar-check input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      if (currentChartType === 'radar') {
        const player = document.getElementById('dash-player').value;
        if (player) loadDashboardPlayerStats(player);
      }
    });
  });
}

// ── Edit Match Data ──
function enterEditMatchMode(container, matchInfo, matchId) {
  // Find the match report meta section and replace with editable form
  const metaEl = document.getElementById(`match-report-meta-${matchId}`);
  if (!metaEl) return;

  const currentRival = matchInfo.rival || '';
  const currentFecha = matchInfo.fecha || '';
  const currentDesc = matchInfo.descripcion || '';
  const currentGf = matchInfo.goles_favor != null ? matchInfo.goles_favor : 0;
  const currentGc = matchInfo.goles_contra != null ? matchInfo.goles_contra : 0;

  metaEl.innerHTML = `
    <div class="match-edit-meta">
      <input type="text" id="edit-match-rival" class="match-input" value="${currentRival}" placeholder="Rival" />
      <input type="date" id="edit-match-fecha" class="match-input match-date" value="${currentFecha}" />
      <input type="text" id="edit-match-desc" class="match-input" value="${currentDesc}" placeholder="Descripción" style="min-width:140px" />
      <div class="match-result-input">
        <input type="number" id="edit-match-gf" class="match-input score-input" min="0" value="${currentGf}" />
        <span class="score-sep">-</span>
        <input type="number" id="edit-match-gc" class="match-input score-input" min="0" value="${currentGc}" />
      </div>
      <button class="btn btn-sm btn-success" id="btn-save-match-data">💾</button>
      <button class="btn btn-sm btn-ghost" id="btn-cancel-match-data">✕</button>
    </div>
  `;

  document.getElementById('btn-save-match-data').addEventListener('click', async () => {
    const body = {
      rival: document.getElementById('edit-match-rival').value.trim(),
      fecha: document.getElementById('edit-match-fecha').value,
      descripcion: document.getElementById('edit-match-desc').value.trim(),
      goles_favor: parseInt(document.getElementById('edit-match-gf').value) || 0,
      goles_contra: parseInt(document.getElementById('edit-match-gc').value) || 0,
    };
    if (!body.rival || !body.fecha) { toast('Rival y fecha son obligatorios', 'error'); return; }
    try {
      const res = await fetchWithTimeout(`${API_URL}/match/${matchId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.success) {
        toast('Partido actualizado', 'success');
        // Reload match data
        const r2 = await fetchWithTimeout(`${API_URL}/match/${matchId}`);
        const d2 = await r2.json();
        if (d2.data && d2.data.stats) {
          renderMatchPlayers(container, d2.data.stats, matchId, d2.data);
        }
        loadMatchHistory();
        initTimeline();
      } else {
        toast('Error actualizando: ' + (data.error || 'desconocido'), 'error');
      }
    } catch (err) {
      toast('Error: ' + err.message, 'error');
    }
  });

  document.getElementById('btn-cancel-match-data').addEventListener('click', () => {
    renderMatchPlayers(container, statsCache || [], matchId, matchInfo);
  });
}

// Keep stats cache for cancel edit match data
const statsCache = [];

// ── Dashboard ──
function initDashboard() {
  const playerSelect = document.getElementById('dash-player');
  const statSelect = document.getElementById('dash-stat');

  playerSelect.addEventListener('change', () => {
    if (playerSelect.value) {
      loadDashboardPlayerStats(playerSelect.value);
    } else {
      document.getElementById('dash-empty').style.display = 'block';
      document.getElementById('dash-chart-wrapper').style.display = 'none';
      document.getElementById('dash-summary-card').style.display = 'none';
      if (dashChart) { dashChart.destroy(); dashChart = null; }
    }
  });

  statSelect.addEventListener('change', () => {
    if (currentChartType === 'bar') {
      loadBarChart();
    } else if (playerSelect.value) {
      loadDashboardPlayerStats(playerSelect.value);
    }
  });

  loadDashboardPlayers();
}

async function loadDashboardPlayers() {
  const select = document.getElementById('dash-player');
  const currentValue = select.value;
  try {
    const res = await fetchWithTimeout(`${API_URL}/players`);
    const data = await res.json();
    select.innerHTML = '<option value="">-- Seleccionar --</option>';
    if (data.data && data.data.length) {
      data.data.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p;
        opt.textContent = p;
        select.appendChild(opt);
      });
    }
    if (currentValue) select.value = currentValue;
  } catch (e) {
    console.error('Error cargando jugadores:', e);
  }
}

async function loadDashboardPlayerStats(playerName) {
  try {
    const res = await fetchWithTimeout(`${API_URL}/stats/player/${encodeURIComponent(playerName)}`);
    const data = await res.json();
    if (!data.data || !data.data.length) {
      document.getElementById('dash-empty').style.display = 'block';
      document.getElementById('dash-empty').querySelector('p').textContent = 'No hay datos para este jugador';
      document.getElementById('dash-chart-wrapper').style.display = 'none';
      document.getElementById('dash-summary-card').style.display = 'none';
      return;
    }
    document.getElementById('dash-empty').style.display = 'none';
    document.getElementById('dash-chart-wrapper').style.display = 'block';

    if (currentChartType === 'radar') {
      updateChartRadar(data.data);
      document.getElementById('dash-summary-card').style.display = 'none';
    } else {
      const statKey = document.getElementById('dash-stat').value;
      updateChart(data.data, statKey);
      updateSummary(data.data, statKey);
    }
  } catch (err) {
    toast('Error cargando datos del jugador: ' + err.message, 'error');
  }
}

function getStatValue(stat, key) {
  if (key === 'goles+asistencias') {
    return (stat.goles || 0) + (stat.asistencias || 0);
  }
  return stat[key];
}

function getStatLabel(key) {
  const labels = {
    valoracion: 'Valoración',
    goles: 'Goles',
    asistencias: 'Asistencias',
    'goles+asistencias': 'G+A',
    pases: 'Pases',
    precision_pases: 'Precisión pases %',
    tiros: 'Tiros',
    precision_tiros: 'Precisión tiros %',
    regates: 'Regates',
    exito_regates: 'Éxito regates %',
    entradas: 'Entradas',
    exito_entradas: 'Éxito entradas %',
    minutos_jugados: 'Minutos',
    distancia_recorrida_km: 'Dist. recorrida',
    distancia_sprint_km: 'Dist. sprint'
  };
  return labels[key] || key;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
}

function updateChart(stats, statKey) {
  const ctx = document.getElementById('dash-chart').getContext('2d');
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const textColor = isLight ? '#1a1d27' : '#e8eaf6';
  const gridColor = isLight ? '#d0d4dc' : '#2e3350';

  if (dashChart) dashChart.destroy();

  const labels = stats.map(s => formatDate(s.fecha || s.match_fecha));
  const values = stats.map(s => {
    const v = getStatValue(s, statKey);
    return v != null ? v : null;
  });

  const isRating = statKey === 'valoracion';
  const suggestedMin = isRating ? Math.max(0, Math.floor(Math.min(...values.filter(v => v != null)) - 0.5)) : undefined;
  const suggestedMax = isRating ? Math.min(10, Math.ceil(Math.max(...values.filter(v => v != null)) + 0.5)) : undefined;

  dashChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: getStatLabel(statKey),
        data: values,
        borderColor: '#00c3ff',
        backgroundColor: (context) => {
          const ctx2 = context.chart.ctx;
          const gradient = ctx2.createLinearGradient(0, 0, 0, 300);
          gradient.addColorStop(0, 'rgba(0, 195, 255, 0.3)');
          gradient.addColorStop(1, 'rgba(0, 195, 255, 0.02)');
          return gradient;
        },
        fill: true,
        tension: 0.3,
        pointBackgroundColor: '#00c3ff',
        pointBorderColor: isLight ? '#ffffff' : '#0f1117',
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        borderWidth: 2,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, labels: { color: textColor, font: { size: 12 } } },
        tooltip: {
          callbacks: {
            label: (context) => `${context.dataset.label}: ${context.parsed.y != null ? context.parsed.y : '—'}`
          }
        }
      },
      scales: {
        x: { ticks: { color: textColor, font: { size: 11 } }, grid: { color: gridColor } },
        y: {
          beginAtZero: !isRating,
          suggestedMin, suggestedMax,
          ticks: { color: textColor, font: { size: 11 } },
          grid: { color: gridColor }
        }
      },
      interaction: { intersect: false, mode: 'index' }
    }
  });
}

function updateSummary(stats, statKey) {
  const isGa = statKey === 'goles+asistencias';
  const values = stats.map(s => getStatValue(s, statKey)).filter(v => v != null);

  if (!values.length) {
    document.getElementById('dash-summary-card').style.display = 'none';
    return;
  }

  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const total = values.reduce((a, b) => a + b, 0);
  const last5 = values.slice(-5);
  const trend = last5.length >= 2 ? (last5[last5.length - 1] - last5[0]).toFixed(1) : '—';

  document.getElementById('dash-summary-player').textContent = stats[0].jugador;
  document.getElementById('dash-summary-card').style.display = 'block';

  const isDec = statKey === 'valoracion' || statKey.includes('precision') || statKey.includes('exito');
  const fmt = (v) => isDec ? v.toFixed(1) : v;

  const grid = document.getElementById('dash-summary');
  grid.innerHTML = `
    <div class="summary-item">
      <div class="summary-value highlight">${fmt(avg)}</div>
      <div class="summary-label">Promedio</div>
    </div>
    <div class="summary-item">
      <div class="summary-value">${stats.length}</div>
      <div class="summary-label">Partidos</div>
    </div>
    <div class="summary-item">
      <div class="summary-value">${fmt(max)}</div>
      <div class="summary-label">Mejor</div>
    </div>
    <div class="summary-item">
      <div class="summary-value">${fmt(min)}</div>
      <div class="summary-label">Peor</div>
    </div>
    <div class="summary-item">
      <div class="summary-value">${!isGa ? fmt(total) : fmt(total)}</div>
      <div class="summary-label">Total</div>
    </div>
    <div class="summary-item">
      <div class="summary-value ${trend > 0 ? 'highlight' : ''}">${trend !== '—' ? (trend > 0 ? '+' : '') + trend : '—'}</div>
      <div class="summary-label">Tendencia (últ. 5)</div>
    </div>
  `;
}

// ── Ranking ──
function initRanking() {
  loadRanking();
}

async function loadRanking() {
  const container = document.getElementById('ranking-container');
  container.innerHTML = '<div class="empty-state"><span class="empty-icon">⏳</span><p>Cargando ranking...</p></div>';

  try {
    const res = await fetchWithTimeout(`${API_URL}/leaderboard`);
    const data = await res.json();
    rankingData = data.data || [];

    if (!rankingData.length) {
      container.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">🏆</span>
          <p>Todavía no hay datos suficientes para mostrar el ranking.</p>
          <p style="margin-top:6px;font-size:13px;color:var(--text-dim)">Subí y guardá estadísticas primero.</p>
        </div>`;
      return;
    }

    rankingSortKey = null;
    rankingSortAsc = true;
    renderRanking(rankingData);
  } catch (err) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">❌</span>
        <p>Error cargando ranking: ${err.message}</p>
      </div>`;
  }
}

function renderRanking(data) {
  const container = document.getElementById('ranking-container');

  const cols = [
    { key: '_rank',     label: '#',       sortable: false },
    { key: 'jugador',   label: 'Jugador', sortable: false },
    { key: 'partidos',  label: 'PJ',      sortable: true },
    { key: 'avg_valoracion', label: '⭐ Valoración', sortable: true },
    { key: 'avg_goles', label: '⚽ Goles', sortable: true },
    { key: 'avg_asistencias', label: '🎯 Asist.', sortable: true },
    { key: '_ga',       label: 'G+A',     sortable: true },
    { key: 'avg_pases', label: '↗ Pases', sortable: true },
    { key: 'avg_precision_pases', label: '✅ Prec.%', sortable: true },
    { key: 'total_goles', label: 'Total ⚽', sortable: true },
    { key: 'total_asistencias', label: 'Total 🎯', sortable: true },
    { key: 'avg_minutos', label: '⏱ Min.', sortable: true },
    { key: 'avg_entradas', label: '🛡 Entr.', sortable: true },
  ];

  const getVal = (row, key) => {
    if (key === '_ga') return (row.avg_goles || 0) + (row.avg_asistencias || 0);
    return row[key];
  };

  const sortIndicator = (key) => {
    if (rankingSortKey !== key) return '';
    return rankingSortAsc ? ' ▲' : ' ▼';
  };

  const getRankDisplay = (i) => {
    if (i === 0) return '<span class="rank-medal">🥇</span>';
    if (i === 1) return '<span class="rank-medal">🥈</span>';
    if (i === 2) return '<span class="rank-medal">🥉</span>';
    return `<span class="rank-number">${i + 1}</span>`;
  };

  const maxValoracion = data.length > 0 ? Math.max(...data.map(r => r.avg_valoracion || 0)) : 1;

  let html = '<div class="table-wrapper"><table class="history-table ranking-table"><thead><tr>';
  for (const col of cols) {
    if (col.sortable) {
      html += `<th class="sortable-th" data-sort="${col.key}">${col.label}${sortIndicator(col.key)}</th>`;
    } else {
      html += `<th>${col.label}</th>`;
    }
  }
  html += '</tr></thead><tbody>';

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    html += '<tr>';
    html += `<td>${getRankDisplay(i)}</td>`;
    html += `<td class="rank-player"><a class="player-link" data-player="${row.jugador || ''}">${row.jugador || '—'}</a></td>`;
    html += `<td>${row.partidos ?? '—'}</td>`;
    html += `<td><span class="rating-badge ${row.avg_valoracion >= 7.5 ? 'high' : row.avg_valoracion >= 6 ? 'mid' : 'low'}">${row.avg_valoracion ?? '—'}</span></td>`;
    html += `<td>${row.avg_goles ?? '—'}</td>`;
    html += `<td>${row.avg_asistencias ?? '—'}</td>`;
    html += `<td>${((row.avg_goles || 0) + (row.avg_asistencias || 0)).toFixed(1)}</td>`;
    html += `<td>${row.avg_pases ?? '—'}</td>`;
    html += `<td>${row.avg_precision_pases ?? '—'}</td>`;
    html += `<td>${row.total_goles ?? '—'}</td>`;
    html += `<td>${row.total_asistencias ?? '—'}</td>`;
    html += `<td>${row.avg_minutos ?? '—'}</td>`;
    html += `<td>${row.avg_entradas ?? '—'}</td>`;
    html += '</tr>';
  }

  html += '</tbody></table></div>';
  container.innerHTML = html;

  container.querySelectorAll('.player-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.stopPropagation();
      const name = link.dataset.player;
      if (name) openPlayerPage(name);
    });
  });

  container.querySelectorAll('.sortable-th').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (rankingSortKey === key) {
        rankingSortAsc = !rankingSortAsc;
      } else {
        rankingSortKey = key;
        rankingSortAsc = key === 'avg_valoracion';
      }
      const sorted = [...data].sort((a, b) => {
        const va = getVal(a, key);
        const vb = getVal(b, key);
        if (va == null) return 1;
        if (vb == null) return -1;
        return rankingSortAsc ? va - vb : vb - va;
      });
      renderRanking(sorted);
    });
  });
}

// ── Season Timeline ──
async function initTimeline() {
  const container = document.getElementById('season-timeline');
  const scroll = document.getElementById('timeline-scroll');
  try {
    const res = await fetchWithTimeout(`${API_URL}/matches/summary`);
    const data = await res.json();
    if (!data.data || !data.data.length) {
      container.style.display = 'none';
      return;
    }
    container.style.display = 'block';
    renderTimeline(data.data);
  } catch {
    container.style.display = 'none';
  }
}

function renderTimeline(matches) {
  const scroll = document.getElementById('timeline-scroll');
  scroll.innerHTML = '';

  for (const m of matches) {
    const val = m.avg_valoracion;
    const valClass = val >= 7.5 ? 'high' : val >= 6 ? 'mid' : 'low';
    const fecha = m.fecha ? new Date(m.fecha + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }) : '—';

    const item = document.createElement('div');
    item.className = 'timeline-item';
    item.dataset.matchId = m.id;
    item.innerHTML = `
      <div class="timeline-dot ${valClass}" title="⭐ ${val != null ? val.toFixed(1) : '—'}"></div>
      <div class="timeline-label-text">${m.rival || '—'}</div>
      <div class="timeline-label-date">${fecha}</div>
    `;
    item.addEventListener('click', () => {
      const card = document.querySelector(`.match-header[data-match-id="${m.id}"]`);
      if (card) {
        card.click();
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
    scroll.appendChild(item);
  }
}

// ═══════════════════════════════════════════
//  Dashboard Multi-Chart
// ═══════════════════════════════════════════

let currentChartType = 'line';

function initDashboardChartType() {
  document.querySelectorAll('.chart-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.chart-type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentChartType = btn.dataset.chart;

      // Show/hide controls
      const playerGroup = document.getElementById('dash-player-group');
      const statGroup = document.getElementById('dash-stat-group');
      const chartWrapper = document.getElementById('dash-chart-wrapper');
      const emptyState = document.getElementById('dash-empty');

      const radarSelector = document.getElementById('radar-stats-selector');
      if (currentChartType === 'bar') {
        playerGroup.style.display = 'none';
        statGroup.style.display = 'flex';
        radarSelector.style.display = 'none';
        emptyState.innerHTML = '<span class="empty-icon">📊</span><p>Seleccioná una estadística para comparar jugadores</p>';
        emptyState.style.display = 'block';
        chartWrapper.style.display = 'none';
        document.getElementById('dash-summary-card').style.display = 'none';
        if (dashChart) { dashChart.destroy(); dashChart = null; }
        loadBarChart();
      } else if (currentChartType === 'radar') {
        playerGroup.style.display = 'flex';
        statGroup.style.display = 'none';
        radarSelector.style.display = 'flex';
        const player = document.getElementById('dash-player').value;
        if (player) {
          loadDashboardPlayerStats(player);
        } else {
          emptyState.innerHTML = '<span class="empty-icon">🕸️</span><p>Seleccioná un jugador para ver su perfil</p>';
          emptyState.style.display = 'block';
          chartWrapper.style.display = 'none';
          document.getElementById('dash-summary-card').style.display = 'none';
          if (dashChart) { dashChart.destroy(); dashChart = null; }
        }
      } else {
        playerGroup.style.display = 'flex';
        statGroup.style.display = 'flex';
        radarSelector.style.display = 'none';
        const player = document.getElementById('dash-player').value;
        if (player) {
          loadDashboardPlayerStats(player);
        } else {
          emptyState.innerHTML = '<span class="empty-icon">📊</span><p>Seleccioná un jugador para ver su evolución</p>';
          emptyState.style.display = 'block';
          chartWrapper.style.display = 'none';
          document.getElementById('dash-summary-card').style.display = 'none';
          if (dashChart) { dashChart.destroy(); dashChart = null; }
        }
      }
    });
  });
}

const LB_KEY_MAP = {
  valoracion: 'avg_valoracion',
  goles: 'avg_goles',
  asistencias: 'avg_asistencias',
  pases: 'avg_pases',
  precision_pases: 'avg_precision_pases',
  tiros: 'avg_tiros',
  precision_tiros: 'avg_precision_tiros',
  regates: 'avg_regates',
  exito_regates: 'avg_exito_regates',
  entradas: 'avg_entradas',
  exito_entradas: 'avg_exito_entradas',
  minutos_jugados: 'avg_minutos',
  distancia_recorrida_km: 'avg_distancia',
  distancia_sprint_km: 'avg_sprint',
};

async function loadBarChart() {
  const statKey = document.getElementById('dash-stat').value;
  const lbKey = LB_KEY_MAP[statKey] || statKey;
  const emptyState = document.getElementById('dash-empty');
  const chartWrapper = document.getElementById('dash-chart-wrapper');
  const summaryCard = document.getElementById('dash-summary-card');

  try {
    const res = await fetchWithTimeout(`${API_URL}/leaderboard`);
    const data = await res.json();
    const players = data.data || [];

    if (!players.length) {
      emptyState.innerHTML = '<span class="empty-icon">📊</span><p>No hay datos de jugadores</p>';
      emptyState.style.display = 'block';
      chartWrapper.style.display = 'none';
      return;
    }

    emptyState.style.display = 'none';
    chartWrapper.style.display = 'block';
    summaryCard.style.display = 'none';

    const isRating = lbKey === 'avg_valoracion';
    const ctx = document.getElementById('dash-chart').getContext('2d');
    if (dashChart) dashChart.destroy();

    const getVal = (p) => {
      if (statKey === 'goles+asistencias') return (p.avg_goles || 0) + (p.avg_asistencias || 0);
      const v = p[lbKey];
      return v != null ? v : 0;
    };

    players.sort((a, b) => getVal(b) - getVal(a));

    const labels = players.map(p => p.jugador);
    const values = players.map(p => getVal(p));

    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const textColor = isLight ? '#1a1d27' : '#e8eaf6';
    const gridColor = isLight ? '#d0d4dc' : '#2e3350';

    dashChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: getStatLabel(statKey),
          data: values,
          backgroundColor: values.map(v => {
            if (isRating) {
              if (v >= 7.5) return 'rgba(0,230,118,0.6)';
              if (v >= 6) return 'rgba(255,214,0,0.6)';
              return 'rgba(255,68,68,0.6)';
            }
            return 'rgba(0,195,255,0.6)';
          }),
          borderColor: values.map(v => {
            if (isRating) {
              if (v >= 7.5) return '#00e676';
              if (v >= 6) return '#ffd600';
              return '#ff4444';
            }
            return '#00c3ff';
          }),
          borderWidth: 1,
          borderRadius: 4,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => `${context.parsed.x != null ? context.parsed.x : '—'}`
            }
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            ticks: { color: textColor, font: { size: 11 } },
            grid: { color: gridColor }
          },
          y: {
            ticks: { color: textColor, font: { size: 11 } },
            grid: { display: false }
          }
        }
      }
    });
  } catch (err) {
    emptyState.innerHTML = `<span class="empty-icon">❌</span><p>Error: ${err.message}</p>`;
    emptyState.style.display = 'block';
    chartWrapper.style.display = 'none';
  }
}

const RADAR_KEYS = ['valoracion', 'goles', 'asistencias', 'pases', 'precision_pases', 'regates', 'entradas', 'tiros', 'minutos_jugados', 'posesion_ganada'];
const RADAR_LABELS = { valoracion: 'Valoración', goles: 'Goles', asistencias: 'Asistencias', pases: 'Pases', precision_pases: 'Precisión %', regates: 'Regates', entradas: 'Entradas', tiros: 'Tiros', minutos_jugados: 'Minutos', posesion_ganada: 'Pos. Ganada' };
const RADAR_NORMALIZERS = { valoracion: 10, goles: 5, asistencias: 5, pases: 150, precision_pases: 100, regates: 30, entradas: 30, tiros: 20, minutos_jugados: 120, posesion_ganada: 20 };

function getRadarSelectedKeys() {
  return Array.from(document.querySelectorAll('.radar-check input[type="checkbox"]:checked')).map(cb => cb.dataset.rkey);
}

function updateChartRadar(stats) {
  const ctx = document.getElementById('dash-chart').getContext('2d');
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const textColor = isLight ? '#1a1d27' : '#e8eaf6';
  const gridColor = isLight ? '#d0d4dc' : '#2e3350';

  if (dashChart) dashChart.destroy();

  const selected = getRadarSelectedKeys();
  if (!selected.length) {
    document.getElementById('dash-empty').innerHTML = '<span class="empty-icon">🕸️</span><p>Seleccioná al menos una estadística</p>';
    document.getElementById('dash-empty').style.display = 'block';
    document.getElementById('dash-chart-wrapper').style.display = 'none';
    return;
  }

  document.getElementById('dash-empty').style.display = 'none';
  document.getElementById('dash-chart-wrapper').style.display = 'block';

  const avg = (key) => {
    const vals = stats.map(s => s[key]).filter(v => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  };

  const radarLabels = selected.map(k => RADAR_LABELS[k] || k);
  const rawValues = selected.map(k => avg(k));
  const radarData = selected.map((k, i) => {
    const norm = RADAR_NORMALIZERS[k] || 10;
    return Math.min(rawValues[i] / norm * 10, 10);
  });

  dashChart = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: radarLabels,
      datasets: [{
        label: stats[0]?.jugador || 'Jugador',
        data: radarData,
        backgroundColor: 'rgba(0,195,255,0.15)',
        borderColor: '#00c3ff',
        borderWidth: 2,
        pointBackgroundColor: '#00c3ff',
        pointBorderColor: isLight ? '#fff' : '#0f1117',
        pointBorderWidth: 2,
        pointRadius: 4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: textColor, font: { size: 12 } } },
        tooltip: {
          callbacks: {
            label: (context) => {
              const i = context.dataIndex;
              const raw = rawValues[i];
              const label = radarLabels[i];
              if (raw == null) return `${label}: —`;
              return `${label}: ${label.includes('%') ? raw.toFixed(0) + '%' : raw.toFixed(1)}`;
            }
          }
        }
      },
      scales: {
        r: {
          beginAtZero: true,
          max: 10,
          ticks: { display: false, stepSize: 2 },
          grid: { color: gridColor },
          angleLines: { color: gridColor },
          pointLabels: { color: textColor, font: { size: 11 } }
        }
      }
    }
  });
}

// ── Player Page ──
function openPlayerPage(playerName) {
  document.getElementById('nav-player').style.display = 'inline-block';
  document.getElementById('nav-player').click();
  loadPlayerData(playerName);
}

async function loadPlayerData(playerName) {
  const content = document.getElementById('player-content');
  const header = document.getElementById('player-name-header');
  header.textContent = playerName;
  content.innerHTML = '<div class="empty-state"><span class="empty-icon">⏳</span><p>Cargando datos de ' + playerName + '...</p></div>';

  try {
    const [statsRes, leaderRes] = await Promise.all([
      fetchWithTimeout(`${API_URL}/stats/player/${encodeURIComponent(playerName)}`),
      fetchWithTimeout(`${API_URL}/leaderboard`)
    ]);
    const statsData = await statsRes.json();
    const leaderData = await leaderRes.json();

    if (!statsData.data || !statsData.data.length) {
      content.innerHTML = '<div class="empty-state"><span class="empty-icon">❌</span><p>Sin datos para este jugador</p></div>';
      return;
    }

    const stats = statsData.data;
    const leaderRow = (leaderData.data || []).find(p => p.jugador?.toLowerCase() === playerName.toLowerCase());

    // Summary
    const n = stats.length;
    const avgVal = stats.reduce((s, r) => s + (r.valoracion || 0), 0) / n;
    const totalG = stats.reduce((s, r) => s + (r.goles || 0), 0);
    const totalA = stats.reduce((s, r) => s + (r.asistencias || 0), 0);
    const avgPases = stats.reduce((s, r) => s + (r.pases || 0), 0) / n;
    const avgPrec = stats.reduce((s, r) => s + (r.precision_pases || 0), 0) / n;
    const avgEnt = stats.reduce((s, r) => s + (r.entradas || 0), 0) / n;

    let html = `
      <div class="player-summary-grid">
        <div class="summary-item"><div class="summary-value highlight">${avgVal.toFixed(1)}</div><div class="summary-label">⭐ Valoración</div></div>
        <div class="summary-item"><div class="summary-value">${n}</div><div class="summary-label">Partidos</div></div>
        <div class="summary-item"><div class="summary-value">${totalG}</div><div class="summary-label">⚽ Goles</div></div>
        <div class="summary-item"><div class="summary-value">${totalA}</div><div class="summary-label">🎯 Asistencias</div></div>
        <div class="summary-item"><div class="summary-value">${avgPases.toFixed(0)}</div><div class="summary-label">↗ Pases/p</div></div>
        <div class="summary-item"><div class="summary-value">${avgPrec.toFixed(0)}%</div><div class="summary-label">✅ Prec. Pases</div></div>
        <div class="summary-item"><div class="summary-value">${avgEnt.toFixed(1)}</div><div class="summary-label">🛡 Entradas/p</div></div>
        <div class="summary-item"><div class="summary-value">${leaderRow && leaderRow._rank !== undefined ? '#' + leaderRow._rank : '—'}</div><div class="summary-label">🏆 Ranking</div></div>
      </div>
    `;

    // Charts side by side
    html += `<div class="player-chart-row">
      <div class="chart-box"><canvas id="player-chart-line"></canvas></div>
      <div class="chart-box"><canvas id="player-chart-radar"></canvas></div>
    </div>`;

    // Match history table
    html += `<h3 style="font-size:14px;color:var(--text-muted);margin:16px 0 8px;">📋 Historial de partidos</h3>`;
    html += `<div class="player-matches-table"><table><thead><tr>
      <th>Fecha</th><th>Rival</th><th>Pos</th><th>Val</th><th>G</th><th>A</th><th>Pases</th><th>Prec.%</th><th>Reg.</th><th>Entr.</th><th>Tiros</th>
    </tr></thead><tbody>`;

    // Sort by date ascending
    const sorted = [...stats].sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
    for (const s of sorted) {
      const fecha = s.match_fecha || s.fecha || '';
      const d = fecha ? new Date(fecha + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }) : '—';
      const posLabel = s.posicion ? POSITIONS.find(p => p.id === s.posicion)?.label.split(' - ')[0] || s.posicion : '—';
      const valClass = s.valoracion >= 7.5 ? 'high' : s.valoracion >= 6 ? 'mid' : 'low';
      html += `<tr>
        <td style="color:var(--text-muted);font-size:12px">${d}</td>
        <td>${s.rival || '—'}</td>
        <td><span class="pos-badge">${posLabel}</span></td>
        <td><span class="rating-badge ${valClass}">${s.valoracion ?? '—'}</span></td>
        <td>${s.goles ?? '—'}</td>
        <td>${s.asistencias ?? '—'}</td>
        <td>${s.pases ?? '—'}</td>
        <td>${s.precision_pases ?? '—'}</td>
        <td>${s.regates ?? '—'}</td>
        <td>${s.entradas ?? '—'}</td>
        <td>${s.tiros ?? '—'}</td>
      </tr>`;
    }
    html += '</tbody></table></div>';

    content.innerHTML = html;

    // Charts
    const ctxLine = document.getElementById('player-chart-line').getContext('2d');
    const ctxRadar = document.getElementById('player-chart-radar').getContext('2d');
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const textColor = isLight ? '#1a1d27' : '#e8eaf6';
    const gridColor = isLight ? '#d0d4dc' : '#2e3350';

    // Line chart: valoracion over time
    const lineLabels = sorted.map(s => s.match_fecha || s.fecha ? new Date((s.match_fecha || s.fecha) + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }) : '');
    const lineValues = sorted.map(s => s.valoracion != null ? s.valoracion : null);
    new Chart(ctxLine, {
      type: 'line',
      data: {
        labels: lineLabels,
        datasets: [{
          label: 'Valoración',
          data: lineValues,
          borderColor: '#00c3ff',
          backgroundColor: (ctx) => {
            const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, 200);
            g.addColorStop(0, 'rgba(0,195,255,0.3)');
            g.addColorStop(1, 'rgba(0,195,255,0.02)');
            return g;
          },
          fill: true,
          tension: 0.3,
          pointBackgroundColor: '#00c3ff',
          pointRadius: 3,
          borderWidth: 2,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: textColor, font: { size: 11 } } },
          title: { display: true, text: '📈 Evolución Valoración', color: textColor, font: { size: 13 } }
        },
        scales: {
          x: { ticks: { color: textColor, font: { size: 10 } }, grid: { color: gridColor } },
          y: { min: 0, max: 10, ticks: { color: textColor, font: { size: 10 } }, grid: { color: gridColor } }
        }
      }
    });

    // Radar chart: use same logic as dashboard
    const selected = getRadarSelectedKeys();
    const rKeys = selected.length ? selected : ['valoracion', 'pases', 'precision_pases', 'regates', 'entradas'];
    const avg = (key) => {
      const vals = stats.map(s => s[key]).filter(v => v != null);
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    };
    const rLabels = rKeys.map(k => RADAR_LABELS[k] || k);
    const rRaw = rKeys.map(k => avg(k));
    const rData = rKeys.map((k, i) => Math.min(rRaw[i] / (RADAR_NORMALIZERS[k] || 10) * 10, 10));

    new Chart(ctxRadar, {
      type: 'radar',
      data: {
        labels: rLabels,
        datasets: [{
          label: playerName,
          data: rData,
          backgroundColor: 'rgba(0,195,255,0.15)',
          borderColor: '#00c3ff',
          borderWidth: 2,
          pointBackgroundColor: '#00c3ff',
          pointRadius: 3,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: textColor, font: { size: 11 } } },
          title: { display: true, text: '🕸️ Perfil de stats', color: textColor, font: { size: 13 } }
        },
        scales: {
          r: {
            beginAtZero: true, max: 10,
            ticks: { display: false, stepSize: 2 },
            grid: { color: gridColor },
            angleLines: { color: gridColor },
            pointLabels: { color: textColor, font: { size: 10 } }
          }
        }
      }
    });

  } catch (err) {
    content.innerHTML = `<div class="empty-state"><span class="empty-icon">❌</span><p>Error: ${err.message}</p></div>`;
  }
}

// Player tab navigation
document.addEventListener('DOMContentLoaded', () => {
  const backBtn = document.getElementById('btn-player-back');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      document.querySelector('.nav-btn.active')?.classList.remove('active');
      document.querySelector('[data-tab="history"]')?.classList.add('active');
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.getElementById('tab-history').classList.add('active');
      document.getElementById('nav-player').style.display = 'none';
      loadMatchHistory();
      initTimeline();
    });
  }

  // Player tab nav button click
  document.getElementById('nav-player')?.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.getElementById('tab-player').classList.add('active');
  });
});

// ── Overlay ──
function showOverlay(text, sub) {
  document.getElementById('overlay-text').textContent = text;
  document.getElementById('overlay-sub').textContent = sub;
  document.getElementById('overlay').style.display = 'flex';
}
function hideOverlay() {
  document.getElementById('overlay').style.display = 'none';
}

// ── Toast ──
function toast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const div = document.createElement('div');
  div.className = `toast ${type}`;
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  div.innerHTML = `<span>${icons[type] || ''}</span><span>${msg}</span>`;
  container.appendChild(div);
  setTimeout(() => div.remove(), 4000);
}
