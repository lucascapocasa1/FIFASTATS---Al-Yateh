/* ==========================================
   FIFA Stats — App.js
   ========================================== */

const API_URL = 'http://localhost:3001/api';

// ── Estado global ──────────────────────────
const state = {
  files: [],          // File[] subidos
  results: [],        // resultados procesados del backend
  history: []         // historial de la DB
};

// ── Init ───────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initDropzone();
  initButtons();
  loadHistory();
});

// ── Tabs ───────────────────────────────────
function initTabs() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${tab}`).classList.add('active');
      if (tab === 'history') loadHistory();
    });
  });
}

// ── Dropzone ───────────────────────────────
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
  const imageFiles = newFiles.filter(f => f.type.startsWith('image/'));
  if (!imageFiles.length) { toast('Solo se aceptan imágenes', 'error'); return; }

  state.files = [...state.files, ...imageFiles];
  renderPreviews();

  // Ocultar resultados anteriores si se cambian archivos
  document.getElementById('results-card').style.display = 'none';
  document.getElementById('save-row').style.display = 'none';
  state.results = [];
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

  state.files.forEach((file, i) => {
    const url = URL.createObjectURL(file);
    const div = document.createElement('div');
    div.className = 'preview-item';
    div.innerHTML = `
      <img src="${url}" alt="${file.name}" />
      <div class="preview-name">${file.name}</div>
      <button class="preview-remove" title="Quitar" data-index="${i}">✕</button>
    `;
    grid.appendChild(div);
  });

  // Quitar imagen individual
  grid.querySelectorAll('.preview-remove').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.index);
      state.files.splice(idx, 1);
      renderPreviews();
    });
  });
}

// ── Buttons ────────────────────────────────
function initButtons() {
  document.getElementById('btn-clear').addEventListener('click', () => {
    state.files = [];
    state.results = [];
    renderPreviews();
    document.getElementById('results-card').style.display = 'none';
  });

  document.getElementById('btn-process').addEventListener('click', processImages);
  document.getElementById('btn-save').addEventListener('click', saveResults);
  document.getElementById('btn-refresh').addEventListener('click', loadHistory);
}

// ── Procesar imágenes ──────────────────────
async function processImages() {
  if (!state.files.length) { toast('Seleccioná al menos una imagen', 'error'); return; }

  showOverlay('Procesando imágenes con OCR...', 'Esto puede tardar unos segundos por imagen');
  document.getElementById('btn-process').disabled = true;

  try {
    const apodo = document.getElementById('apodo-input').value.trim();
    const formData = new FormData();
    state.files.forEach(f => formData.append('images', f));
    if (apodo) formData.append('apodo', apodo);

    const response = await fetch(`${API_URL}/upload`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || `Error HTTP ${response.status}`);
    }

    const data = await response.json();
    state.results = data.results;
    renderResults(data);

  } catch (err) {
    console.error(err);
    toast(`Error: ${err.message}`, 'error');
  } finally {
    hideOverlay();
    document.getElementById('btn-process').disabled = false;
  }
}

// ── Render resultados ──────────────────────
function renderResults(data) {
  const card = document.getElementById('results-card');
  const list = document.getElementById('results-list');
  const meta = document.getElementById('results-meta');
  const saveRow = document.getElementById('save-row');

  card.style.display = 'block';
  meta.textContent = `${data.exitosos} exitosos / ${data.fallidos} fallidos de ${data.total}`;

  list.innerHTML = '';

  data.results.forEach((result, idx) => {
    const hasData = result.success && result.data;
    const hasWarnings = result.warnings && result.warnings.length > 0;

    const statusClass = !result.success ? 'error' : hasWarnings ? 'warning' : 'ok';

    const div = document.createElement('div');
    div.className = 'result-item';
    div.innerHTML = `
      <div class="result-header" data-idx="${idx}">
        <span class="result-status ${statusClass}"></span>
        <span class="result-filename">${result.filename}</span>
        ${hasData ? `<span class="result-player">👤 ${result.data.jugador}</span>` : ''}
        <span class="result-arrow">▾</span>
      </div>
      <div class="result-body">
        ${renderResultBody(result)}
      </div>
    `;
    list.appendChild(div);

    // Toggle expand
    div.querySelector('.result-header').addEventListener('click', () => {
      div.classList.toggle('expanded');
    });
  });

  // Mostrar botón guardar si hay al menos un resultado exitoso
  const successfulResults = data.results.filter(r => r.success && r.data);
  if (successfulResults.length > 0) {
    saveRow.style.display = 'flex';
  }

  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderResultBody(result) {
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

  const statsConfig = [
    { key: 'goles',                label: 'Goles',                 emoji: '⚽' },
    { key: 'asistencias',          label: 'Asistencias',           emoji: '🎯' },
    { key: 'valoracion',           label: 'Valoración',            emoji: '⭐' },
    { key: 'tiros',                label: 'Tiros',                 emoji: '🏃' },
    { key: 'precision_tiros',      label: 'Precisión tiros %',     emoji: '🎯' },
    { key: 'pases',                label: 'Pases',                 emoji: '↗' },
    { key: 'precision_pases',      label: 'Precisión pases %',     emoji: '✅' },
    { key: 'regates',              label: 'Regates',               emoji: '💫' },
    { key: 'exito_regates',        label: 'Éxito regates %',       emoji: '🔥' },
    { key: 'entradas',             label: 'Entradas',              emoji: '🛡' },
    { key: 'exito_entradas',       label: 'Éxito entradas %',      emoji: '✔' },
    { key: 'fueras_de_juego',      label: 'Fueras de lugar',       emoji: '🚩' },
    { key: 'faltas',               label: 'Faltas',                emoji: '❌' },
    { key: 'posesion_ganada',      label: 'Posesión ganada',       emoji: '🟢' },
    { key: 'posesion_perdida',     label: 'Posesión perdida',      emoji: '🔴' },
    { key: 'minutos_jugados',      label: 'Minutos',               emoji: '⏱' },
    { key: 'distancia_recorrida_km', label: 'Dist. recorrida km',  emoji: '📏' },
    { key: 'distancia_sprint_km',  label: 'Dist. sprint km',       emoji: '⚡' },
  ];

  html += '<div class="stats-grid">';
  for (const s of statsConfig) {
    const val = d[s.key];
    const isNull = val === null || val === undefined;
    html += `
      <div class="stat-cell">
        <div class="stat-label">${s.emoji} ${s.label}</div>
        <div class="stat-value ${isNull ? 'null-val' : ''}">${isNull ? '—' : val}</div>
      </div>
    `;
  }
  html += '</div>';

  // Debug OCR (collapsible)
  if (result.ocr_debug) {
    html += `
      <div class="ocr-debug">
        <details>
          <summary>🔍 Ver texto OCR extraído (debug)</summary>
          <pre><strong>Nombre:</strong>\n${result.ocr_debug.name_text}\n\n<strong>Stats panel:</strong>\n${result.ocr_debug.stats_text}</pre>
        </details>
      </div>
    `;
  }

  return html;
}

// ── Guardar en DB ──────────────────────────
async function saveResults() {
  const validStats = state.results
    .filter(r => r.success && r.data)
    .map(r => r.data);

  if (!validStats.length) { toast('No hay datos válidos para guardar', 'error'); return; }

  showOverlay('Guardando datos...', '');
  document.getElementById('btn-save').disabled = true;

  try {
    const response = await fetch(`${API_URL}/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stats: validStats })
    });

    const data = await response.json();

    if (!response.ok) throw new Error(data.error || 'Error guardando');

    toast(`✅ ${data.saved} registro(s) guardado(s) correctamente`, 'success');
    document.getElementById('save-row').style.display = 'none';

    // Limpiar y resetear
    state.files = [];
    state.results = [];
    renderPreviews();
    document.getElementById('results-card').style.display = 'none';
    document.getElementById('preview-card').style.display = 'none';

  } catch (err) {
    toast(`Error: ${err.message}`, 'error');
  } finally {
    hideOverlay();
    document.getElementById('btn-save').disabled = false;
  }
}

// ── Historial ──────────────────────────────
async function loadHistory() {
  const container = document.getElementById('history-container');
  container.innerHTML = '<div class="empty-state"><span class="empty-icon">⏳</span><p>Cargando...</p></div>';

  try {
    const response = await fetch(`${API_URL}/stats`);
    const data = await response.json();

    state.history = data.data || [];

    if (!state.history.length) {
      container.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">📊</span>
          <p>No hay estadísticas guardadas todavía.</p>
        </div>`;
      return;
    }

    renderHistory(state.history, container);

  } catch (err) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">❌</span>
        <p>Error cargando datos: ${err.message}</p>
        <p style="margin-top:8px;font-size:12px;color:var(--text-dim)">Asegurate que el backend esté corriendo en localhost:3001</p>
      </div>`;
  }
}

function renderHistory(data, container) {
  const cols = [
    { key: 'jugador',      label: 'Jugador' },
    { key: 'valoracion',   label: 'Val.' },
    { key: 'goles',        label: 'G' },
    { key: 'asistencias',  label: 'AST' },
    { key: 'pases',        label: 'Pases' },
    { key: 'precision_pases', label: 'Prec.%' },
    { key: 'tiros',        label: 'Tiros' },
    { key: 'regates',      label: 'Reg.' },
    { key: 'minutos_jugados', label: 'Min.' },
    { key: 'fecha',        label: 'Fecha' },
    { key: '_actions',     label: '' }
  ];

  let html = `
    <div class="table-wrapper">
    <table class="history-table">
      <thead><tr>
        ${cols.map(c => `<th>${c.label}</th>`).join('')}
      </tr></thead>
      <tbody>
  `;

  for (const row of data) {
    html += '<tr>';
    for (const col of cols) {
      if (col.key === '_actions') {
        html += `<td><button class="btn btn-danger" onclick="deleteRow(${row.id})" title="Eliminar">✕</button></td>`;
      } else if (col.key === 'jugador') {
        html += `<td class="player-name">${row.jugador || '—'}</td>`;
      } else if (col.key === 'valoracion') {
        const v = row.valoracion;
        const cls = v >= 7.5 ? 'high' : v >= 6 ? 'mid' : 'low';
        html += `<td><span class="rating-badge ${cls}">${v ?? '—'}</span></td>`;
      } else if (col.key === 'fecha') {
        const d = row.fecha ? new Date(row.fecha).toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—';
        html += `<td class="date-cell">${d}</td>`;
      } else {
        html += `<td>${row[col.key] ?? '—'}</td>`;
      }
    }
    html += '</tr>';
  }

  html += '</tbody></table></div>';
  container.innerHTML = html;
}

async function deleteRow(id) {
  if (!confirm('¿Eliminar este registro?')) return;
  try {
    await fetch(`${API_URL}/stats/${id}`, { method: 'DELETE' });
    toast('Registro eliminado', 'info');
    loadHistory();
  } catch (err) {
    toast('Error eliminando: ' + err.message, 'error');
  }
}

// ── Overlay ────────────────────────────────
function showOverlay(text, sub) {
  document.getElementById('overlay-text').textContent = text;
  document.getElementById('overlay-sub').textContent = sub;
  document.getElementById('overlay').style.display = 'flex';
}
function hideOverlay() {
  document.getElementById('overlay').style.display = 'none';
}

// ── Toast ──────────────────────────────────
function toast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const div = document.createElement('div');
  div.className = `toast ${type}`;
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  div.innerHTML = `<span>${icons[type] || ''}</span><span>${msg}</span>`;
  container.appendChild(div);
  setTimeout(() => div.remove(), 4000);
}
