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
    CREATE TABLE IF NOT EXISTS stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      fecha TEXT DEFAULT (datetime('now'))
    )
  `);

  saveDB();
  return db;
}

function saveDB() {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

async function insertStats(stats) {
  const db = await getDB();
  const fields = [
    'jugador', 'goles', 'asistencias', 'tiros', 'precision_tiros',
    'pases', 'precision_pases', 'regates', 'exito_regates',
    'entradas', 'exito_entradas', 'fueras_de_juego', 'faltas',
    'posesion_ganada', 'posesion_perdida', 'minutos_jugados',
    'distancia_recorrida_km', 'distancia_sprint_km', 'valoracion'
  ];

  const placeholders = fields.map(() => '?').join(', ');
  const values = fields.map(f => stats[f] ?? null);

  db.run(
    `INSERT INTO stats (${fields.join(', ')}) VALUES (${placeholders})`,
    values
  );

  saveDB();

  // Return last inserted id
  const result = db.exec('SELECT last_insert_rowid() as id');
  return result[0]?.values[0][0];
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

async function deleteStats(id) {
  const db = await getDB();
  db.run('DELETE FROM stats WHERE id = ?', [id]);
  saveDB();
}

module.exports = { getDB, insertStats, getAllStats, deleteStats };
