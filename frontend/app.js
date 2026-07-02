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
  initRanking();
  loadMatchHistory();
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
      if (tab === 'history') loadMatchHistory();
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
      const matchRes = await fetchWithTimeout(`${API_URL}/match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rival, descripcion, fecha })
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

    card.innerHTML = `
      <div class="match-header" data-match-id="${match.id}">
        <div class="match-info">
          <span class="match-rival">🆚 ${match.rival}</span>
          <span class="match-date">${fecha}</span>
          ${match.descripcion ? `<span class="match-desc">${match.descripcion}</span>` : ''}
        </div>
        <div class="match-meta">
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
            renderMatchPlayers(list, data.data.stats, matchId);
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

function renderMatchPlayers(container, stats, matchId) {
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

  // Pitch view
  const pitchHtml = renderPitchView(stats, mvpName);
  const pitchDiv = document.createElement('div');
  pitchDiv.innerHTML = pitchHtml;
  container.appendChild(pitchDiv.firstElementChild);

  // Stats table
  const table = document.createElement('div');
  table.className = 'match-stats-table';
  table.innerHTML = buildMatchTable(stats);
  container.appendChild(table);

  const editRow = document.createElement('div');
  editRow.className = 'match-edit-row';
  editRow.innerHTML = `<button class="btn btn-sm btn-ghost btn-edit-match">✏️ Editar</button>`;
  container.appendChild(editRow);

  editRow.querySelector('.btn-edit-match').addEventListener('click', () => {
    enterEditMode(container, stats, matchId);
  });
}

function renderPitchView(stats, mvpName) {
  const gridPos = {
    GK:  { row: 5, col: 3 },
    DFCI: { row: 4, col: 2 },
    DFC:  { row: 4, col: 3 },
    DFCD: { row: 4, col: 4 },
    MCD:  { row: 3, col: 3 },
    MI:   { row: 2, col: 1 },
    MCI:  { row: 2, col: 2 },
    MCR:  { row: 2, col: 4 },
    MD:   { row: 2, col: 5 },
    DC:   { row: 1, col: 2 },
  };

  // Build grid cells: 5 rows x 5 cols
  const grid = Array.from({ length: 5 }, () => Array(5).fill(null));

  let dcCount = 0;
  const unplaced = [];

  for (const s of stats) {
    const pos = s.posicion || '';
    if (pos === 'DC') {
      dcCount++;
      const col = dcCount === 1 ? 2 : 4;
      const row = 1;
      grid[row - 1][col - 1] = { ...s, _mvp: s.jugador === mvpName };
    } else if (gridPos[pos]) {
      const { row, col } = gridPos[pos];
      grid[row - 1][col - 1] = { ...s, _mvp: s.jugador === mvpName };
    } else {
      unplaced.push(s);
    }
  }

  let html = '<div class="pitch-container"><div class="pitch">';
  html += '<div class="pitch-lines">';
  html += '<div class="pitch-center-circle"></div>';
  html += '<div class="pitch-center-line"></div>';
  html += '<div class="pitch-penalty-top"></div>';
  html += '<div class="pitch-penalty-bottom"></div>';
  html += '</div>';

  html += '<div class="pitch-grid">';
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const p = grid[r][c];
      if (p) {
        const valClass = p.valoracion >= 7.5 ? 'high' : p.valoracion >= 6 ? 'mid' : 'low';
        html += `<div class="pitch-cell" style="grid-row:${r+1};grid-column:${c+1}">`;
        html += `<div class="pitch-player ${p._mvp ? 'mvp' : ''}">`;
        html += `<div class="pitch-player-name">${p.jugador || '?'}</div>`;
        html += `<div class="pitch-player-val ${valClass}">${p.valoracion != null ? p.valoracion.toFixed(1) : '—'}</div>`;
        if (p._mvp) html += '<div class="pitch-mvp-badge">MVP</div>';
        html += '</div></div>';
      } else {
        html += `<div class="pitch-cell empty" style="grid-row:${r+1};grid-column:${c+1}"></div>`;
      }
    }
  }
  html += '</div></div>';

  // Unplaced players
  if (unplaced.length) {
    html += '<div class="pitch-unplaced">';
    html += '<div class="pitch-unplaced-title">Sin posición asignada:</div>';
    for (const p of unplaced) {
      html += `<span class="pos-badge">${p.jugador || '?'}</span>`;
    }
    html += '</div>';
  }

  html += '</div>';
  return html;
}

function buildMatchTable(stats) {
  // Pre-determine MVP for highlighting
  let maxVal = -1;
  let mvps = [];
  for (const s of stats) {
    const v = s.valoracion != null ? s.valoracion : -1;
    if (v > maxVal) { maxVal = v; mvps = [s.jugador]; }
    else if (v === maxVal && v >= 0) { mvps.push(s.jugador); }
  }
  const mvpName = mvps.length > 0 ? mvps[Math.floor(Math.random() * mvps.length)] : null;

  let html = '<table><thead><tr>';
  html += '<th>Pos</th>';
  for (const f of HISTORY_STAT_FIELDS) {
    html += `<th>${f.label}</th>`;
  }
  html += '<th></th>';
  html += '</tr></thead><tbody>';

  for (const s of stats) {
    const valClass = s.valoracion >= 7.5 ? 'high' : s.valoracion >= 6 ? 'mid' : 'low';
    const posLabel = s.posicion ? POSITIONS.find(p => p.id === s.posicion)?.label.split(' - ')[0] || s.posicion : '—';
    const isMvp = s.jugador === mvpName;
    html += '<tr>';
    html += `<td><span class="pos-badge">${posLabel}</span></td>`;
    html += `<td class="player-name">${s.jugador || '—'}${isMvp ? ' 👑' : ''}</td>`;
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

function enterEditMode(container, stats, matchId) {
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
    renderMatchPlayers(container, stats, matchId);
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
        renderMatchPlayers(container, data.data.stats, matchId);
      }
    } catch {}
  });
}

// ── Dashboard (unchanged) ──
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
    if (playerSelect.value) loadDashboardPlayerStats(playerSelect.value);
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
    const statKey = document.getElementById('dash-stat').value;
    updateChart(data.data, statKey);
    updateSummary(data.data, statKey);
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
    html += `<td class="rank-player">${row.jugador || '—'}</td>`;
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
