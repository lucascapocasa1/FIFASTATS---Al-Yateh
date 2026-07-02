const express = require('express');
const multer = require('multer');
const router = express.Router();

const { cropStatsPanel, cropPlayerName } = require('./imageProcessor');
const { runOCR } = require('./ocr');
const { parseStats, extractSelectedPlayer, validateStats } = require('./parser');
const { insertStats, createMatch, updateStats, getMatchById, getMatches, getMatchStats, getAllStats, deleteStats, deleteMatch, getLeaderboard, getStatsByPlayer, getAllPlayers } = require('./db');

const CONCURRENCY = 3;

async function processSingleImage(file, index) {
  const result = {
    filename: file.originalname,
    success: false,
    data: null,
    errors: [],
    warnings: []
  };

  console.log(`[API] Procesando #${index}: ${file.originalname}, size: ${file.buffer.length}`);
  try {
    const imageBuffer = file.buffer;

    const nameBuffer = await cropPlayerName(imageBuffer);
    const nameOcrText = await runOCR(nameBuffer);

    let playerName = extractSelectedPlayer(nameOcrText);
    if (!playerName) playerName = 'desconocido';

    result.ocr_debug = { name_text: nameOcrText.substring(0, 300) };

    const statsBuffer = await cropStatsPanel(imageBuffer);
    const statsOcrText = await runOCR(statsBuffer);

    result.ocr_debug.stats_text = statsOcrText.substring(0, 800);

    const stats = parseStats(statsOcrText, playerName, nameOcrText);

    const validation = validateStats(stats);
    if (!validation.valid) {
      result.warnings = validation.errors;
    }

    result.success = true;
    result.data = stats;
    console.log(`[API] #${index} EXITOSO: ${stats.jugador}`);

  } catch (err) {
    result.errors.push(`Error: ${err.message}`);
    console.error(`[API] Error #${index} ${file.originalname}:`, err);
  }

  return result;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Solo se aceptan imágenes'));
  }
});

/**
 * POST /upload
 * Procesa imágenes FIFA y retorna los datos parseados con nombre detectado.
 */
router.post('/upload', upload.array('images', 30), async (req, res) => {
  console.log('[API] POST /upload -', req.files?.length || 0, 'archivos recibidos');
  if (!req.files || req.files.length === 0) {
    console.log('[API] No se enviaron imágenes');
    return res.status(400).json({ error: 'No se enviaron imágenes' });
  }

  const files = req.files;
  const results = [];
  let nextIdx = 0;

  async function worker() {
    while (nextIdx < files.length) {
      const idx = nextIdx++;
      results[idx] = await processSingleImage(files[idx], idx);
    }
  }

  const workers = Array(Math.min(CONCURRENCY, files.length))
    .fill()
    .map(() => worker());

  await Promise.all(workers);

  console.log(`[API] Upload completado: ${results.filter(r=>r.success).length} exitosos, ${results.filter(r=>!r.success).length} fallidos`);
  res.json({
    total: results.length,
    exitosos: results.filter(r => r.success).length,
    fallidos: results.filter(r => !r.success).length,
    results
  });
});

/**
 * POST /match
 * Crea un nuevo partido.
 * Body: { rival, descripcion, fecha }
 */
router.post('/match', async (req, res) => {
  try {
    const { rival, descripcion, fecha } = req.body;
    console.log('[API] POST /match - body:', { rival, descripcion, fecha });
    if (!rival || !fecha) {
      console.log('[API] POST /match - Campos faltantes');
      return res.status(400).json({ error: 'Faltan campos requeridos: rival, fecha' });
    }
    const id = await createMatch(rival, descripcion, fecha);
    console.log('[API] POST /match - Creado con id:', id);
    res.json({ success: true, id });
  } catch (err) {
    console.error('[API] POST /match - Error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /matches
 * Lista todos los partidos con cantidad de jugadores.
 */
router.get('/matches', async (req, res) => {
  try {
    const matches = await getMatches();
    res.json({ data: matches });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /match/:id
 * Retorna un partido con sus estadísticas.
 */
router.get('/match/:id', async (req, res) => {
  try {
    const matchId = parseInt(req.params.id);
    const match = await getMatchById(matchId);
    if (!match) {
      return res.status(404).json({ error: 'Partido no encontrado' });
    }
    const stats = await getMatchStats(matchId);
    res.json({ data: { ...match, stats } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /match/:id
 * Elimina un partido y todas sus estadísticas asociadas.
 */
router.delete('/match/:id', async (req, res) => {
  try {
    await deleteMatch(parseInt(req.params.id));
    res.json({ success: true, deleted: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /save
 * Guarda un registro de estadísticas (individual, asociado a un match opcional).
 * Body: { stats: {...}, match_id: 123 }
 */
router.post('/save', async (req, res) => {
  const { stats, match_id } = req.body;
  console.log('[API] POST /save - match_id:', match_id, 'jugador:', stats?.jugador);

  if (!stats) {
    console.log('[API] POST /save - No stats');
    return res.status(400).json({ error: 'No se enviaron estadísticas' });
  }

  const validation = validateStats(stats);
  if (!validation.valid) {
    console.log('[API] POST /save - Validación fallida:', validation.errors);
    return res.status(400).json({ errors: validation.errors });
  }

  try {
    const id = await insertStats(stats, match_id || null);
    console.log('[API] POST /save - Insertado id:', id, 'para:', stats.jugador);
    res.json({ success: true, id, jugador: stats.jugador });
  } catch (err) {
    console.error('[API] POST /save - Error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /stats
 * Retorna todas las estadísticas individuales.
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await getAllStats();
    res.json({ total: stats.length, data: stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /stats/:id
 * Actualiza un registro de estadísticas.
 * Body: { stats: { ... } }
 */
router.put('/stats/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { stats } = req.body;
    if (!stats) {
      return res.status(400).json({ error: 'No se enviaron estadísticas' });
    }
    await updateStats(id, stats);
    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /stats/:id
 */
router.delete('/stats/:id', async (req, res) => {
  try {
    await deleteStats(parseInt(req.params.id));
    res.json({ success: true, deleted: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /stats/player/:name
 */
router.get('/stats/player/:name', async (req, res) => {
  try {
    const stats = await getStatsByPlayer(req.params.name);
    res.json({ total: stats.length, data: stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /leaderboard
 */
router.get('/leaderboard', async (req, res) => {
  try {
    const board = await getLeaderboard();
    res.json({ data: board });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /players
 */
router.get('/players', async (req, res) => {
  try {
    const players = await getAllPlayers();
    res.json({ data: players });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /health
 */
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

module.exports = router;
