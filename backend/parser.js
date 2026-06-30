/**
 * Parser de estadísticas FIFA Clubes Pro
 * 
 * Las stats aparecen como pares "jugador vs equipo":
 *   "Goles    0  2"  → el jugador tiene 0
 *   "Precisión en los pases (%)    85  90" → el jugador tiene 85
 * 
 * Siempre tomamos el PRIMER número de la línea (el del jugador).
 */

/**
 * Extrae el nombre del jugador del texto OCR del panel izquierdo/superior.
 * El nombre suele estar debajo de la posición (ej: "MCI lucasyjoaqui 8.4")
 */
function extractPlayerName(ocrText) {
  const text = ocrText.toLowerCase();
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // Buscar líneas que contengan CR/calificación + nombre
  // Patrón: posición + nombre + número (valoración)
  const posiciones = ['po', 'pdc', 'dfc', 'dci', 'dd', 'di', 'mcd', 'mci', 'mc', 'md', 'mi', 'mcd', 'ext', 'sd', 'si', 'dc', 'glb', 'mor'];

  for (const line of lines) {
    const parts = line.split(/\s+/);
    if (parts.length >= 2) {
      // Buscar si hay una posición reconocible
      const firstWord = parts[0].toLowerCase().replace(/[^a-z]/g, '');
      if (posiciones.includes(firstWord) && parts.length >= 2) {
        // El nombre sería el segundo token
        const nombre = parts[1];
        if (nombre && nombre.length > 2 && !/^\d/.test(nombre)) {
          return nombre.toLowerCase();
        }
      }
    }
  }

  // Fallback: buscar línea con calificación numérica tipo "8.4"
  for (const line of lines) {
    const match = line.match(/([a-záéíóúñ][a-záéíóúñ0-9_]{2,})\s+[\d.]+\s*$/i);
    if (match) {
      return match[1].toLowerCase();
    }
  }

  // Buscar el texto más prominente que parezca un nombre de usuario
  for (const line of lines) {
    const match = line.match(/^([a-z][a-z0-9_]{3,20})\s*$/i);
    if (match) {
      return match[1].toLowerCase();
    }
  }

  return null;
}

/**
 * Extrae un posible apodo/nombre del texto OCR del panel superior
 * Se filtra ruido conocido (posiciones, etiquetas) y se devuelve
 * el primer token que parezca un nombre de usuario o apodo.
 * Si no encuentra nada, devuelve null (para que el frontend pida el apodo).
 */
function extractSelectedPlayer(nameOcrText) {
  const lines = nameOcrText.split('\n').map(l => l.trim()).filter(Boolean);

  const noiseWords = new Set([
    'res', 'cr', 'califica', 'calificacion', 'calificación', 'nombre',
    'po', 'pdc', 'dfc', 'dci', 'dd', 'di', 'mcd', 'mci', 'mc', 'md', 'mi',
    'ext', 'sd', 'si', 'dc', 'glb', 'mor',
    'l', 'mu'
  ]);

  for (const line of lines) {
    const clean = line.toLowerCase();
    if (noiseWords.has(clean)) continue;
    if (/^[a-z][a-z0-9_áéíóúñ]{2,25}$/.test(clean)) {
      return clean;
    }
  }

  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    for (const part of parts) {
      const lower = part.toLowerCase();
      if (noiseWords.has(lower)) continue;
      if (/^[a-z][a-z0-9_áéíóúñ]{3,20}$/.test(lower) && !/^\d+$/.test(lower)) {
        return lower;
      }
    }
  }

  return null;
}

/**
 * Extrae el primer número de una cadena (valor del jugador, el primero en "jugador vs equipo")
 * Previamente normaliza OCR misreads: 0 → O/o, o), Lo), oO
 */
function extractFirstNumber(str) {
  // OCR confunde 0 con O/o (común en FIFA stats cuando el jugador tiene 0)
  const normalized = str
    .replace(/[Oo]\)/g, '0')
    .replace(/Lo\)/g, '0')
    .replace(/[Oo]O/g, '0')
    .replace(/\b[Oo]\b/g, '0');

  // Usar regex que no matchee puntos sueltos (ej: "Asist."), solo números enteros o decimales
  const numbers = normalized.match(/\d+(?:\.\d+)?/g);
  if (!numbers || numbers.length === 0) return null;
  const val = parseFloat(numbers[0]);
  return isNaN(val) ? null : val;
}

/**
 * Busca una stat en el texto OCR dado un conjunto de keywords.
 * Retorna el primer número encontrado en la línea que matchea (del jugador).
 */
function findStat(lines, keywords) {
  for (const line of lines) {
    const lower = line.toLowerCase();
    const matches = keywords.some(kw => lower.includes(kw.toLowerCase()));
    if (matches) {
      const val = extractFirstNumber(line);
      if (val !== null) return val;
    }
  }
  return null;
}

/**
 * Extrae la calificación/valoración del texto.
 * Aparece como número con decimal tipo "8.4" o "7.6"
 */
function extractValoracion(text) {
  // Buscar patrones como "6.8", "8.4", "7.6" que sean calificaciones
  const matches = text.match(/\b([5-9]\.\d|10\.0)\b/g);
  if (matches && matches.length > 0) {
    // Tomar la primera (suele ser la del jugador seleccionado)
    return parseFloat(matches[0]);
  }
  return null;
}

/**
 * Parser principal: recibe texto OCR del panel de stats y devuelve objeto JSON
 */
function parseStats(statsOcrText, playerName = null) {
  const lines = statsOcrText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  const result = {
    jugador: playerName || 'desconocido',
    goles: null,
    asistencias: null,
    tiros: null,
    precision_tiros: null,
    pases: null,
    precision_pases: null,
    regates: null,
    exito_regates: null,
    entradas: null,
    exito_entradas: null,
    fueras_de_juego: null,
    faltas: null,
    posesion_ganada: null,
    posesion_perdida: null,
    minutos_jugados: null,
    distancia_recorrida_km: null,
    distancia_sprint_km: null,
    valoracion: null
  };

  // Extraer valoración del texto completo
  result.valoracion = extractValoracion(statsOcrText);

  // Mapeo de campos a keywords para buscar en las líneas
  const mappings = [
    { field: 'goles',              keywords: ['goles', 'goal'] },
    { field: 'asistencias',        keywords: ['asist', 'assist'] },
    { field: 'tiros',              keywords: ['tiros', 'shots'] },
    { field: 'precision_tiros',    keywords: ['precisión en los tiros', 'precision en los tiros', 'precisi'] },
    { field: 'pases',              keywords: ['pases', 'passes'] },
    { field: 'precision_pases',    keywords: ['precisión en los pases', 'precision en los pases'] },
    { field: 'regates',            keywords: ['regates', 'dribbles'] },
    { field: 'exito_regates',      keywords: ['tasa de éxito de los regates', 'tasa de exito de los regates', 'éxito de los regates', 'exito de los regates'] },
    { field: 'entradas',           keywords: ['entradas', 'tackles'] },
    { field: 'exito_entradas',     keywords: ['tasa de éxito en entradas', 'tasa de exito en entradas', 'éxito en entradas', 'exito en entradas'] },
    { field: 'fueras_de_juego',    keywords: ['fueras de lugar', 'fuera de juego', 'fueras de juego', 'offside'] },
    { field: 'faltas',             keywords: ['faltas cometidas', 'faltas'] },
    { field: 'posesion_ganada',    keywords: ['posesión ganada', 'posesion ganada'] },
    { field: 'posesion_perdida',   keywords: ['posesión perdida', 'posesion perdida'] },
    { field: 'minutos_jugados',    keywords: ['minutos jugados', 'minutes'] },
  ];

  for (const { field, keywords } of mappings) {
    const val = findStat(lines, keywords);
    if (val !== null) {
      result[field] = Number.isInteger(val) || val % 1 === 0 ? Math.round(val) : val;
    }
  }

  // Distancias (pueden aparecer como "18.1 16.5")
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.includes('dist') && lower.includes('recorrida') || lower.includes('recorrida vs')) {
      result.distancia_recorrida_km = extractFirstNumber(line);
    }
    if (lower.includes('dist') && lower.includes('carrera') || lower.includes('sprint') || lower.includes('en carrera vs')) {
      result.distancia_sprint_km = extractFirstNumber(line);
    }
  }

  // Validar y convertir tipos
  const intFields = ['goles', 'asistencias', 'tiros', 'precision_tiros', 'pases',
    'precision_pases', 'regates', 'exito_regates', 'entradas', 'exito_entradas',
    'fueras_de_juego', 'faltas', 'posesion_ganada', 'posesion_perdida', 'minutos_jugados'];

  for (const f of intFields) {
    if (result[f] !== null) result[f] = Math.round(result[f]);
  }

  return result;
}

/**
 * Valida que el resultado tenga al menos los campos mínimos
 */
function validateStats(stats) {
  const errors = [];

  if (!stats.jugador || stats.jugador === 'desconocido') {
    errors.push('No se pudo detectar el nombre del jugador');
  }

  const requiredFields = ['goles', 'asistencias', 'pases'];
  let missingCount = 0;
  for (const f of requiredFields) {
    if (stats[f] === null) missingCount++;
  }

  if (missingCount === requiredFields.length) {
    errors.push('No se pudieron extraer estadísticas básicas (goles, asistencias, pases)');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

module.exports = { parseStats, extractSelectedPlayer, extractPlayerName, validateStats };
