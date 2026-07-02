const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'fifa_stats.db');

let db = null;

async function getDB() {
  if (db) return db;

  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rival TEXT NOT NULL,
      descripcion TEXT,
      fecha TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id INTEGER,
      jugador TEXT NOT NULL,
      goles INTEGER,
      asistencias INTEGER,
      tiros INTEGER,
      precision_tiros INTEGER,
      pases INTEGER,
      precision_pases INTEGER,
      regates INTEGER,
      exito_regates INTEGER,
      entradas INTEGER,
      exito_entradas INTEGER,
      fueras_de_juego INTEGER,
      faltas INTEGER,
      posesion_ganada INTEGER,
      posesion_perdida INTEGER,
      minutos_jugados INTEGER,
      distancia_recorrida_km REAL,
      distancia_sprint_km REAL,
      valoracion REAL,
      fecha TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (match_id) REFERENCES matches(id)
    )
  `);

  // Add match_id column if it doesn't exist (migration for old DBs)
  try { db.run('ALTER TABLE stats ADD COLUMN match_id INTEGER REFERENCES matches(id)'); } catch (e) {}

  saveDB();
  return db;
}

let writeQueue = Promise.resolve();

function serialized(fn) {
  return async function (...args) {
    const result = writeQueue.then(() => fn(...args));
    writeQueue = result.catch(() => {});
    return result;
  };
}

function saveDB() {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

async function _insertStats(stats, matchId = null) {
  console.log('[DB] insertStats - jugador:', stats?.jugador, 'matchId:', matchId);
  const db = await getDB();
  const fields = [
    'match_id', 'jugador', 'goles', 'asistencias', 'tiros', 'precision_tiros',
    'pases', 'precision_pases', 'regates', 'exito_regates',
    'entradas', 'exito_entradas', 'fueras_de_juego', 'faltas',
    'posesion_ganada', 'posesion_perdida', 'minutos_jugados',
    'distancia_recorrida_km', 'distancia_sprint_km', 'valoracion'
  ];

  const placeholders = fields.map(() => '?').join(', ');
  const values = fields.map(f => f === 'match_id' ? matchId : (stats[f] ?? null));
  console.log('[DB] insertStats - values:', JSON.stringify(values));

  db.run(
    `INSERT INTO stats (${fields.join(', ')}) VALUES (${placeholders})`,
    values
  );

  const result = db.exec('SELECT MAX(id) as id FROM stats');
  const id = result[0]?.values[0][0];
  console.log('[DB] insertStats - id retornado:', id);
  saveDB();
  return id;
}

async function _createMatch(rival, descripcion, fecha) {
  console.log('[DB] createMatch - rival:', rival, 'fecha:', fecha);
  const db = await getDB();
  db.run(
    'INSERT INTO matches (rival, descripcion, fecha) VALUES (?, ?, ?)',
    [rival, descripcion || '', fecha]
  );
  const result = db.exec('SELECT MAX(id) as id FROM matches');
  const id = result[0]?.values[0][0];
  console.log('[DB] createMatch - id:', id);
  saveDB();
  return id;
}

async function getMatches() {
  const db = await getDB();
  const result = db.exec(`
    SELECT m.*, COUNT(s.id) as jugadores
    FROM matches m
    LEFT JOIN stats s ON s.match_id = m.id
    GROUP BY m.id
    ORDER BY m.created_at DESC
  `);
  if (!result.length) return [];
  const { columns, values } = result[0];
  return values.map(row => {
    const obj = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  });
}

async function getMatchStats(matchId) {
  const db = await getDB();
  const stmt = db.prepare('SELECT * FROM stats WHERE match_id = ? ORDER BY jugador ASC');
  stmt.bind([matchId]);
  const values = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    // Convert match_id to number
    if (row.match_id !== null) row.match_id = Number(row.match_id);
    values.push(row);
  }
  stmt.free();
  return values;
}

async function _deleteStats(id) {
  const db = await getDB();
  db.run('DELETE FROM stats WHERE id = ?', [id]);
  saveDB();
}

async function _deleteMatch(matchId) {
  const db = await getDB();
  db.run('DELETE FROM stats WHERE match_id = ?', [matchId]);
  db.run('DELETE FROM matches WHERE id = ?', [matchId]);
  saveDB();
}

async function getLeaderboard() {
  const db = await getDB();
  const result = db.exec(`
    SELECT
      jugador,
      COUNT(*) as partidos,
      ROUND(AVG(goles), 1) as avg_goles,
      ROUND(AVG(asistencias), 1) as avg_asistencias,
      ROUND(AVG(valoracion), 1) as avg_valoracion,
      ROUND(AVG(tiros), 1) as avg_tiros,
      ROUND(AVG(precision_tiros), 0) as avg_precision_tiros,
      ROUND(AVG(pases), 1) as avg_pases,
      ROUND(AVG(precision_pases), 0) as avg_precision_pases,
      ROUND(AVG(regates), 1) as avg_regates,
      ROUND(AVG(exito_regates), 0) as avg_exito_regates,
      ROUND(AVG(entradas), 1) as avg_entradas,
      ROUND(AVG(exito_entradas), 0) as avg_exito_entradas,
      ROUND(AVG(minutos_jugados), 1) as avg_minutos,
      ROUND(AVG(distancia_recorrida_km), 1) as avg_distancia,
      ROUND(AVG(distancia_sprint_km), 1) as avg_sprint,
      ROUND(AVG(fueras_de_juego), 1) as avg_fueras_de_juego,
      ROUND(AVG(faltas), 1) as avg_faltas,
      ROUND(AVG(posesion_ganada), 1) as avg_posesion_ganada,
      ROUND(AVG(posesion_perdida), 1) as avg_posesion_perdida,
      SUM(goles) as total_goles,
      SUM(asistencias) as total_asistencias
    FROM stats
    GROUP BY LOWER(jugador)
    ORDER BY avg_valoracion DESC
  `);
  if (!result.length) return [];
  const { columns, values } = result[0];
  return values.map(row => {
    const obj = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  });
}

async function getStatsByPlayer(playerName) {
  const db = await getDB();
  const stmt = db.prepare(
    `SELECT s.*, m.rival, m.fecha as match_fecha
     FROM stats s
     LEFT JOIN matches m ON m.id = s.match_id
     WHERE LOWER(s.jugador) = LOWER(?)
     ORDER BY s.fecha ASC`
  );
  stmt.bind([playerName]);
  const values = [];
  while (stmt.step()) {
    values.push(stmt.getAsObject());
  }
  stmt.free();
  return values;
}

async function getAllPlayers() {
  const db = await getDB();
  const result = db.exec('SELECT DISTINCT jugador FROM stats ORDER BY jugador ASC');
  if (!result.length || !result[0].values.length) return [];
  return result[0].values.map(row => row[0]);
}

async function getAllStats() {
  const db = await getDB();
  const result = db.exec('SELECT * FROM stats ORDER BY fecha DESC');
  if (!result.length) return [];
  const { columns, values } = result[0];
  return values.map(row => {
    const obj = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  });
}

const insertStats = serialized(_insertStats);
const createMatch = serialized(_createMatch);
const deleteStats = serialized(_deleteStats);
const deleteMatch = serialized(_deleteMatch);

module.exports = { getDB, insertStats, createMatch, getMatches, getMatchStats, getAllStats, deleteStats, deleteMatch, getLeaderboard, getStatsByPlayer, getAllPlayers };