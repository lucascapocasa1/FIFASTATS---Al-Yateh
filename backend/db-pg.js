const { Pool } = require('pg');

let pool = null;

async function getPool() {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  pool = new Pool({
    connectionString,
    ssl: connectionString.includes('render.com') ? { rejectUnauthorized: false } : false,
  });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS matches (
      id SERIAL PRIMARY KEY,
      rival TEXT NOT NULL,
      descripcion TEXT,
      fecha TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      goles_favor INTEGER DEFAULT 0,
      goles_contra INTEGER DEFAULT 0,
      temporada TEXT DEFAULT '',
      notas TEXT DEFAULT '',
      detalle_goles TEXT DEFAULT '',
      imagenes TEXT DEFAULT ''
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS stats (
      id SERIAL PRIMARY KEY,
      match_id INTEGER REFERENCES matches(id) ON DELETE CASCADE,
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
      fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      posicion TEXT DEFAULT '',
      mvp_ig INTEGER DEFAULT 0,
      part_ig INTEGER DEFAULT 0
    )
  `);

  console.log('[DB] Conectado a PostgreSQL');
  return pool;
}

async function insertStats(stats, matchId = null) {
  const db = await getPool();
  const fields = [
    'match_id', 'jugador', 'goles', 'asistencias', 'tiros', 'precision_tiros',
    'pases', 'precision_pases', 'regates', 'exito_regates',
    'entradas', 'exito_entradas', 'fueras_de_juego', 'faltas',
    'posesion_ganada', 'posesion_perdida', 'minutos_jugados',
    'distancia_recorrida_km', 'distancia_sprint_km', 'valoracion', 'posicion',
    'mvp_ig', 'part_ig'
  ];
  const values = fields.map(f => f === 'match_id' ? matchId : (stats[f] ?? null));
  const placeholders = fields.map((_, i) => `$${i + 1}`).join(', ');
  const result = await db.query(
    `INSERT INTO stats (${fields.join(', ')}) VALUES (${placeholders}) RETURNING id`,
    values
  );
  return result.rows[0].id;
}

async function createMatch(rival, descripcion, fecha, golesFavor = 0, golesContra = 0, temporada = '', notas = '', detalleGoles = '') {
  const db = await getPool();
  const result = await db.query(
    `INSERT INTO matches (rival, descripcion, fecha, goles_favor, goles_contra, temporada, notas, detalle_goles) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [rival, descripcion || '', fecha, golesFavor, golesContra, temporada, notas, detalleGoles]
  );
  return result.rows[0].id;
}

async function getMatches(season = '') {
  const db = await getPool();
  const params = [];
  let sql = `
    SELECT m.*, COUNT(s.id)::int as jugadores
    FROM matches m
    LEFT JOIN stats s ON s.match_id = m.id
  `;
  if (season) {
    sql += ` WHERE m.temporada = $1`;
    params.push(season);
  }
  sql += ` GROUP BY m.id ORDER BY m.created_at DESC`;
  const result = await db.query(sql, params);
  return result.rows;
}

async function getMatchStats(matchId) {
  const db = await getPool();
  const result = await db.query(
    `SELECT * FROM stats WHERE match_id = $1 ORDER BY CASE WHEN posicion = '' THEN 1 ELSE 0 END, posicion ASC, jugador ASC`,
    [matchId]
  );
  return result.rows;
}

async function getMatchById(matchId) {
  const db = await getPool();
  const result = await db.query(
    `SELECT m.*, COUNT(s.id)::int as jugadores
     FROM matches m
     LEFT JOIN stats s ON s.match_id = m.id
     WHERE m.id = $1
     GROUP BY m.id`,
    [matchId]
  );
  return result.rows[0] || null;
}

async function updateStats(id, data) {
  const db = await getPool();
  const allowed = [
    'jugador', 'goles', 'asistencias', 'tiros', 'precision_tiros',
    'pases', 'precision_pases', 'regates', 'exito_regates',
    'entradas', 'exito_entradas', 'fueras_de_juego', 'faltas',
    'posesion_ganada', 'posesion_perdida', 'minutos_jugados',
    'distancia_recorrida_km', 'distancia_sprint_km', 'valoracion', 'posicion',
    'mvp_ig', 'part_ig'
  ];
  const fields = allowed.filter(f => f in data);
  if (!fields.length) throw new Error('No hay campos para actualizar');
  const setClauses = fields.map((f, i) => `${f} = $${i + 1}`);
  const values = fields.map(f => data[f]);
  values.push(id);
  await db.query(`UPDATE stats SET ${setClauses.join(', ')} WHERE id = $${fields.length + 1}`, values);
}

async function deleteStats(id) {
  const db = await getPool();
  await db.query('DELETE FROM stats WHERE id = $1', [id]);
}

async function updateMatch(id, data) {
  const db = await getPool();
  const allowed = ['rival', 'descripcion', 'fecha', 'goles_favor', 'goles_contra', 'temporada', 'notas', 'detalle_goles'];
  const fields = allowed.filter(f => f in data);
  if (!fields.length) throw new Error('No hay campos para actualizar');
  const setClauses = fields.map((f, i) => `${f} = $${i + 1}`);
  const values = fields.map(f => data[f]);
  values.push(id);
  await db.query(`UPDATE matches SET ${setClauses.join(', ')} WHERE id = $${fields.length + 1}`, values);
}

async function deleteMatch(matchId) {
  const db = await getPool();
  await db.query('DELETE FROM matches WHERE id = $1', [matchId]);
}

async function getMatchesSummary(season = '') {
  const db = await getPool();
  const params = [];
  let sql = `
    SELECT
      m.id, m.rival, m.descripcion, m.fecha, m.created_at, m.temporada,
      COUNT(s.id)::int as jugadores,
      ROUND(AVG(s.valoracion)::numeric, 1)::float as avg_valoracion
    FROM matches m
    LEFT JOIN stats s ON s.match_id = m.id
  `;
  if (season) {
    sql += ` WHERE m.temporada = $1`;
    params.push(season);
  }
  sql += ` GROUP BY m.id ORDER BY m.fecha ASC`;
  const result = await db.query(sql, params);
  return result.rows;
}

async function getLeaderboard() {
  const db = await getPool();
  const result = await db.query(`
    SELECT
      jugador,
      COUNT(*)::int as partidos,
      ROUND(AVG(goles)::numeric, 1)::float as avg_goles,
      ROUND(AVG(asistencias)::numeric, 1)::float as avg_asistencias,
      ROUND(AVG(valoracion)::numeric, 1)::float as avg_valoracion,
      ROUND(AVG(tiros)::numeric, 1)::float as avg_tiros,
      ROUND(AVG(precision_tiros)::numeric, 0)::float as avg_precision_tiros,
      ROUND(AVG(pases)::numeric, 1)::float as avg_pases,
      ROUND(AVG(precision_pases)::numeric, 0)::float as avg_precision_pases,
      ROUND(AVG(regates)::numeric, 1)::float as avg_regates,
      ROUND(AVG(exito_regates)::numeric, 0)::float as avg_exito_regates,
      ROUND(AVG(entradas)::numeric, 1)::float as avg_entradas,
      ROUND(AVG(exito_entradas)::numeric, 0)::float as avg_exito_entradas,
      ROUND(AVG(minutos_jugados)::numeric, 1)::float as avg_minutos,
      ROUND(AVG(distancia_recorrida_km)::numeric, 1)::float as avg_distancia,
      ROUND(AVG(distancia_sprint_km)::numeric, 1)::float as avg_sprint,
      ROUND(AVG(fueras_de_juego)::numeric, 1)::float as avg_fueras_de_juego,
      ROUND(AVG(faltas)::numeric, 1)::float as avg_faltas,
      ROUND(AVG(posesion_ganada)::numeric, 1)::float as avg_posesion_ganada,
      ROUND(AVG(posesion_perdida)::numeric, 1)::float as avg_posesion_perdida,
      SUM(goles)::int as total_goles,
      SUM(asistencias)::int as total_asistencias
    FROM stats
    GROUP BY jugador
    ORDER BY avg_valoracion DESC
  `);
  return result.rows;
}

async function getStatsByPlayer(playerName) {
  const db = await getPool();
  const result = await db.query(
    `SELECT s.*, m.rival, m.fecha as match_fecha
     FROM stats s
     LEFT JOIN matches m ON m.id = s.match_id
     WHERE LOWER(s.jugador) = LOWER($1)
     ORDER BY s.fecha ASC`,
    [playerName]
  );
  return result.rows;
}

async function getTeamSummary() {
  const db = await getPool();
  const result = await db.query(`
    SELECT
      m.id, m.rival, m.fecha, m.goles_favor, m.goles_contra,
      COUNT(s.id)::int as jugadores,
      ROUND(AVG(s.valoracion)::numeric, 2)::float as avg_valoracion,
      ROUND(AVG(s.pases)::numeric, 1)::float as avg_pases,
      ROUND(AVG(s.precision_pases)::numeric, 1)::float as avg_precision_pases,
      ROUND(AVG(s.posesion_ganada)::numeric, 1)::float as avg_posesion_ganada,
      ROUND(AVG(s.posesion_perdida)::numeric, 1)::float as avg_posesion_perdida,
      ROUND(AVG(s.tiros)::numeric, 1)::float as avg_tiros,
      ROUND(AVG(s.entradas)::numeric, 1)::float as avg_entradas,
      ROUND(AVG(s.regates)::numeric, 1)::float as avg_regates,
      ROUND(AVG(s.faltas)::numeric, 1)::float as avg_faltas,
      ROUND(AVG(s.minutos_jugados)::numeric, 0)::int as avg_minutos,
      SUM(s.goles)::int as total_goles,
      SUM(s.asistencias)::int as total_asistencias
    FROM matches m
    LEFT JOIN stats s ON s.match_id = m.id
    GROUP BY m.id
    ORDER BY m.fecha ASC
  `);
  return result.rows;
}

async function getAllPlayers() {
  const db = await getPool();
  const result = await db.query('SELECT DISTINCT jugador FROM stats ORDER BY jugador ASC');
  return result.rows.map(r => r.jugador);
}

async function getSeasons() {
  const db = await getPool();
  const result = await db.query("SELECT DISTINCT temporada FROM matches WHERE temporada != '' ORDER BY temporada DESC");
  return result.rows.map(r => r.temporada);
}

async function getAllStats() {
  const db = await getPool();
  const result = await db.query('SELECT * FROM stats ORDER BY fecha DESC');
  return result.rows;
}

async function addMatchImage(matchId, filename) {
  const db = await getPool();
  const match = await getMatchById(matchId);
  if (!match) throw new Error('Partido no encontrado');
  const existing = match.imagenes || '';
  const list = existing ? existing.split(',').filter(Boolean) : [];
  if (!list.includes(filename)) list.push(filename);
  await db.query('UPDATE matches SET imagenes = $1 WHERE id = $2', [list.join(','), matchId]);
}

async function removeMatchImage(matchId, filename) {
  const db = await getPool();
  const match = await getMatchById(matchId);
  if (!match) throw new Error('Partido no encontrado');
  const existing = match.imagenes || '';
  const list = existing.split(',').filter(Boolean).filter(f => f !== filename);
  await db.query('UPDATE matches SET imagenes = $1 WHERE id = $2', [list.join(','), matchId]);
}

module.exports = { insertStats, createMatch, updateStats, updateMatch, getMatchById, getMatches, getMatchStats, getMatchesSummary, getAllStats, deleteStats, deleteMatch, getLeaderboard, getStatsByPlayer, getAllPlayers, getSeasons, getTeamSummary, addMatchImage, removeMatchImage };
