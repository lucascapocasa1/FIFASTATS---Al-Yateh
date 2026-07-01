const API_URL = 'http://localhost:3001/api';

const state = {
  files: [],
  results: [],
  history: []
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
  loadHistory();
  loadPlayerDatalist();
});

// ── Tabs ──
function initTabs() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${tab}`).classList.add('active');
      if (tab === 'history') loadHistory();
      if (tab === 'dashboard') {
        loadDashboardPlayers();
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
  if (dashChart) {
    updateChartColors();
  }
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
  const imageFiles = newFiles.filter(f => f.type.startsWith('image/'));
  if (!imageFiles.length) { toast('Solo se aceptan imágenes', 'error'); return; }

  state.files = [...state.files, ...imageFiles];
  renderPreviews();

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

  grid.querySelectorAll('.preview-remove').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.index);
      state.files.splice(idx, 1);
      renderPreviews();
    });
  });
}

// ── Buttons ──
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
  document.getElementById('btn-rank-refresh').addEventListener('click', loadRanking);
}

// ── Player Datalist (autocomplete en apodo) ──
async function loadPlayerDatalist() {
  try {
    const res = await fetch(`${API_URL}/players`);
    const data = await res.json();
    if (data.data && data.data.length) {
      const dl = document.getElementById('player-datalist');
      dl.innerHTML = data.data.map(p => `<option value="${p}">`).join('');
    }
  } catch (e) {
    // Silencioso — no crítico
  }
}

// ── Process Images ──
async function processImages() {
  if (!state.files.length) { toast('Seleccioná al menos una imagen', 'error'); return; }

  const apodo = document.getElementById('apodo-input').value.trim();
  if (!apodo) { toast('Ingresá el apodo del jugador', 'error'); return; }

  showOverlay('Procesando imágenes con OCR...', 'Esto puede tardar unos segundos por imagen');
  document.getElementById('btn-process').disabled = true;

  try {
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

// ── Render Results ──
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

    div.querySelector('.result-header').addEventListener('click', () => {
      div.classList.toggle('expanded');
    });
  });

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

// ── Save ──
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

    state.files = [];
    state.results = [];
    renderPreviews();
    document.getElementById('results-card').style.display = 'none';
    document.getElementById('preview-card').style.display = 'none';

    loadPlayerDatalist();

  } catch (err) {
    toast(`Error: ${err.message}`, 'error');
  } finally {
    hideOverlay();
    document.getElementById('btn-save').disabled = false;
  }
}

// ── History ──
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
    if (playerSelect.value) {
      loadDashboardPlayerStats(playerSelect.value);
    }
  });

  loadDashboardPlayers();
}

async function loadDashboardPlayers() {
  const select = document.getElementById('dash-player');
  const currentValue = select.value;
  try {
    const res = await fetch(`${API_URL}/players`);
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
    // Silencioso
  }
}

async function loadDashboardPlayerStats(playerName) {
  try {
    const res = await fetch(`${API_URL}/stats/player/${encodeURIComponent(playerName)}`);
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

  if (dashChart) {
    dashChart.destroy();
  }

  const labels = stats.map(s => formatDate(s.fecha));
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
        legend: {
          display: true,
          labels: {
            color: textColor,
            font: { size: 12 }
          }
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const val = context.parsed.y;
              return `${context.dataset.label}: ${val != null ? val : '—'}`;
            }
          }
        }
      },
      scales: {
        x: {
          ticks: { color: textColor, font: { size: 11 } },
          grid: { color: gridColor }
        },
        y: {
          beginAtZero: !isRating,
          suggestedMin,
          suggestedMax,
          ticks: { color: textColor, font: { size: 11 } },
          grid: { color: gridColor }
        }
      },
      interaction: {
        intersect: false,
        mode: 'index'
      }
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
    const res = await fetch(`${API_URL}/leaderboard`);
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
    const barPct = ((row.avg_valoracion || 0) / maxValoracion) * 100;
    const barClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : 'normal';
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

  // Sort click handlers
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
