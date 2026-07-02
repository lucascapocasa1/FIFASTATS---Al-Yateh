const express = require('express');
const multer = require('multer');
const router = express.Router();

const { cropStatsPanel, cropPlayerName } = require('./imageProcessor');
const { runOCR } = require('./ocr');
const { parseStats, extractSelectedPlayer, validateStats } = require('./parser');
const { insertStats, createMatch, getMatches, getMatchStats, getAllStats, deleteStats, deleteMatch, getLeaderboard, getStatsByPlayer, getAllPlayers } = require('./db');

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

  // Ya no usamos apodo global — cada imagen detecta su propio jugador
  const results = [];

  for (let i = 0; i < req.files.length; i++) {
    const file = req.files[i];
    const result = {
      filename: file.originalname,
      success: false,
      data: null,
      errors: [],
      warnings: []
    };

    console.log(`[API] Procesando #${i}: ${file.originalname}, size: ${file.buffer.length}`);
    try {
      const imageBuffer = file.buffer;

      // 1. Recortar y hacer OCR del panel del nombre
      console.log(`[API] #${i} Recortando nombre...`);
      const nameBuffer = await cropPlayerName(imageBuffer);
      console.log(`[API] #${i} OCR nombre (buffer: ${nameBuffer.length} bytes)...`);
      const nameOcrText = await runOCR(nameBuffer);
      console.log(`[API] #${i} Texto OCR nombre (${nameOcrText.length} chars): ${nameOcrText.substring(0, 100)}`);

      // Detectar nombre del jugador automáticamente
      let playerName = extractSelectedPlayer(nameOcrText);
      console.log(`[API] #${i} Nombre detectado: "${playerName}"`);
      if (!playerName) playerName = 'desconocido';

      result.ocr_debug = result.ocr_debug || {};
      result.ocr_debug.name_text = nameOcrText.substring(0, 300);

      // 2. Recortar y hacer OCR del panel de stats
      console.log(`[API] #${i} Recortando stats...`);
      const statsBuffer = await cropStatsPanel(imageBuffer);
      console.log(`[API] #${i} OCR stats (buffer: ${statsBuffer.length} bytes)...`);
      const statsOcrText = await runOCR(statsBuffer);
      console.log(`[API] #${i} Texto OCR stats (${statsOcrText.length} chars): ${statsOcrText.substring(0, 150)}`);

      result.ocr_debug = result.ocr_debug || {};
      result.ocr_debug.stats_text = statsOcrText.substring(0, 800);

      // 3. Parsear
      const stats = parseStats(statsOcrText, playerName, nameOcrText);
      console.log(`[API] #${i} Stats parseados:`, JSON.stringify(stats));

      // 4. Validar
      const validation = validateStats(stats);
      if (!validation.valid) {
        console.log(`[API] #${i} Warnings de validación:`, validation.errors);
        result.warnings = validation.errors;
      }

      result.success = true;
      result.data = stats;
      console.log(`[API] #${i} Resultado EXITOSO: ${stats.jugador}`);

    } catch (err) {
      result.errors.push(`Error procesando imagen: ${err.message}`);
      console.error(`[API] Error en #${i} ${file.originalname}:`, err);
    }

    results.push(result);
  }

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
router.post('/match', express.json(), async (req, res) => {
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
    // Buscar datos del partido entre los matches
    const matches = await getMatches();
    const match = matches.find(m => m.id === matchId);
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
router.post('/save', express.json(), async (req, res) => {
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
