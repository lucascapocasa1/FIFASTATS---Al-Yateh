const express = require('express');
const multer = require('multer');
const router = express.Router();

const { cropStatsPanel, cropPlayerName } = require('./imageProcessor');
const { runOCR } = require('./ocr');
const { parseStats, extractSelectedPlayer, validateStats } = require('./parser');
const { insertStats, getAllStats, deleteStats, getLeaderboard, getStatsByPlayer, getAllPlayers } = require('./db');

// Multer: memoria (no guardar en disco)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB por imagen
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Solo se aceptan imágenes'));
  }
});

/**
 * POST /upload
 * Procesa una o múltiples imágenes FIFA y retorna los datos parseados.
 */
router.post('/upload', upload.array('images', 30), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No se enviaron imágenes' });
  }

  const apodo = (req.body.apodo || '').trim().toLowerCase();

  const results = [];

  for (const file of req.files) {
    const result = {
      filename: file.originalname,
      success: false,
      data: null,
      errors: [],
      warnings: []
    };

    try {
      const imageBuffer = file.buffer;

      let playerName = apodo || null;
      let nameOcrText = null;

      // 1. Recortar panel de nombre del jugador (parte superior)
      // Siempre se procesa porque también contiene la valoración
      const nameBuffer = await cropPlayerName(imageBuffer);
      nameOcrText = await runOCR(nameBuffer);

      // NO extraer nombre automáticamente de la imagen — solo usar el apodo ingresado
      // para evitar que agarre nombres reales (ej: "Facundo") en vez del gamertag

      // DEBUG: guardar texto OCR para troubleshooting
      result.ocr_debug = result.ocr_debug || {};
      result.ocr_debug.name_text = nameOcrText.substring(0, 300);

      // 2. Recortar panel derecho de estadísticas
      const statsBuffer = await cropStatsPanel(imageBuffer);
      const statsOcrText = await runOCR(statsBuffer);

      // DEBUG: guardar texto OCR para troubleshooting
      result.ocr_debug = result.ocr_debug || {};
      result.ocr_debug.stats_text = statsOcrText.substring(0, 800);

      // 3. Parsear estadísticas (pasar nameOcrText como respaldo para la valoración)
      const stats = parseStats(statsOcrText, playerName, nameOcrText);

      // 4. Validar
      const validation = validateStats(stats);
      if (!validation.valid) {
        result.warnings = validation.errors;
      }

      result.success = true;
      result.data = stats;

    } catch (err) {
      result.errors.push(`Error procesando imagen: ${err.message}`);
      console.error(`Error en ${file.originalname}:`, err);
    }

    results.push(result);
  }

  res.json({
    total: results.length,
    exitosos: results.filter(r => r.success).length,
    fallidos: results.filter(r => !r.success).length,
    results
  });
});

/**
 * POST /save
 * Guarda uno o varios registros de estadísticas en la base de datos.
 * Body: { stats: [ {...}, {...} ] } o { stats: {...} }
 */
router.post('/save', express.json(), async (req, res) => {
  const { stats } = req.body;

  if (!stats) {
    return res.status(400).json({ error: 'No se enviaron estadísticas' });
  }

  const items = Array.isArray(stats) ? stats : [stats];
  const saved = [];
  const errors = [];

  for (const item of items) {
    try {
      const validation = validateStats(item);
      if (!validation.valid) {
        errors.push({ jugador: item.jugador, errors: validation.errors });
        continue;
      }

      const id = await insertStats(item);
      saved.push({ id, jugador: item.jugador });
    } catch (err) {
      errors.push({ jugador: item.jugador, errors: [err.message] });
    }
  }

  res.json({
    saved: saved.length,
    errors: errors.length,
    savedItems: saved,
    errorItems: errors
  });
});

/**
 * GET /stats
 * Retorna todas las estadísticas guardadas, ordenadas por fecha desc.
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
 * Elimina un registro por ID.
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
 * Retorna todas las estadísticas de un jugador específico, ordenadas por fecha ASC.
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
 * Retorna promedios agregados por jugador para el ranking.
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
 * Retorna la lista de nombres de jugadores distintos.
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
 * Health check.
 */
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

module.exports = router;
