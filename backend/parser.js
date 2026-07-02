/**
 * Parser de estadísticas FIFA Clubes Pro
 * 
 * Las stats aparecen como pares "jugador vs equipo":
 *   "Goles    0  2"  → el jugador tiene 0
 *   "Precisión en los pases (%)    85  90" → el jugador tiene 85
 * 
 * Siempre tomamos el PRIMER número de la línea (el del jugador).
 */

const CANONICAL_NAMES = [
  'Adri', 'Charly', 'Nacho', 'Jere', 'Facu', 'Valen', 'Lucas',
  'Davi', 'Pepo', 'Niki', 'Lauti', 'Santi', 'Nico'
];

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]) + 1;
    }
  }
  return dp[m][n];
}

function normalizePlayerName(name) {
  if (!name) return null;
  const lower = name.toLowerCase().trim();
  for (const canonical of CANONICAL_NAMES) {
    if (canonical.toLowerCase() === lower) return canonical;
  }
  // Fuzzy match: find the canonical name with smallest Levenshtein distance
  let best = null;
  let bestDist = Infinity;
  for (const canonical of CANONICAL_NAMES) {
    const dist = levenshtein(lower, canonical.toLowerCase());
    if (dist < bestDist) {
      bestDist = dist;
      best = canonical;
    }
  }
  // Threshold: max 3 edits or 40% of the name length
  const threshold = Math.max(3, Math.floor(lower.length * 0.4));
  if (best && bestDist <= threshold) return best;
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
  // OCR confunde 0 con O/o y E (común en FIFA stats cuando el jugador tiene 0)
  const normalized = str
    .replace(/[Oo]\)/g, '0')
    .replace(/Lo\)/g, '0')
    .replace(/[Oo]O/g, '0')
    .replace(/\b[Oo]\b/g, '0')
    .replace(/\b[Ee]\b/g, '0');

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
 * Extrae la calificación/valoración del texto del panel de estadísticas.
 * Aparece como número con decimal tipo "8.4" o "7.6"
 * También corrige confusiones comunes del OCR (6↔9, .↔,)
 */
function extractValoracion(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // 1. Buscar en líneas con palabras clave de calificación
  const ratingKeywords = ['calificación', 'calificacion', 'calif', 'cr', 'rating', 'valoración', 'valoracion', 'cal'];
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (ratingKeywords.some(kw => lower.includes(kw))) {
      const nums = line.match(/\b(\d\.\d)\b/g);
      if (nums && nums.length > 0) {
        // El primer decimal en la línea suele ser la valoración del jugador
        const firstVal = parseFloat(nums[0]);
        if (firstVal >= 1.0 && firstVal <= 10.0) {
          // Si es ≥ 9.0 y hay un segundo valor que es el mismo con 6↔9, preferir el segundo
          if (firstVal >= 9.0 && nums.length >= 2) {
            const secondVal = parseFloat(nums[1]);
            if (secondVal >= 1.0 && secondVal <= 10.0) {
              const firstStr = firstVal.toFixed(1);
              const secondStr = secondVal.toFixed(1);
              if (firstStr.replace('9', '6') === secondStr || firstStr.replace('6', '9') === secondStr) {
                return secondVal;
              }
            }
          }
          return firstVal;
        }
      }
    }
  }

  // 2. Fallback: buscar cualquier decimal en todo el texto
  const matches = text.match(/\b(\d\.\d)\b/g);
  if (matches && matches.length > 0) {
    const ratings = matches
      .map(m => parseFloat(m))
      .filter(v => v >= 1.0 && v <= 10.0)
      .sort((a, b) => b - a);
    if (ratings.length > 0) {
      // Si el valor más alto es ≥ 9.0, verificar si confunde 6 con 9
      if (ratings[0] >= 9.0 && ratings.length >= 2) {
        const highStr = ratings[0].toFixed(1);
        for (let i = 1; i < ratings.length; i++) {
          const lowStr = ratings[i].toFixed(1);
          // Si intercambiar 9↔6 en el valor alto da el valor bajo, preferir el bajo
          if (highStr.replace('9', '6') === lowStr || highStr.replace('6', '9') === lowStr) {
            return ratings[i];
          }
        }
      }
      return ratings[0];
    }
  }

  // 3. Fallback: buscar decimales con coma (OCR a veces confunde . con ,)
  const matchesComma = text.match(/\b(\d,\d)\b/g);
  if (matchesComma && matchesComma.length > 0) {
    for (const m of matchesComma) {
      const val = parseFloat(m.replace(',', '.'));
      if (val >= 1.0 && val <= 10.0) return val;
    }
  }
  return null;
}

/**
 * Extrae la calificación/valoración del texto del panel del nombre.
 * En el panel del nombre la valoración aparece al final de la línea
 * junto al nombre del jugador (ej: "mci lucasyjoaqui 6.9")
 */
function extractValoracionFromName(nameOcrText) {
  const lines = nameOcrText.split('\n').map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    // 1. Buscar un decimal al final de la línea que sea una valoración
    const match = line.match(/(\d\.\d)\s*$/);
    if (match) {
      const val = parseFloat(match[1]);
      if (val >= 1.0 && val <= 10.0) return val;
    }
    // 2. Buscar decimal en cualquier posición si hay pocos números en la línea
    const allNums = line.match(/\b(\d\.\d)\b/g);
    if (allNums && allNums.length === 1) {
      const val = parseFloat(allNums[0]);
      if (val >= 1.0 && val <= 10.0) return val;
    }
    // 3. Buscar valoración entre paréntesis, ej: "(7)" o "(6.8)"
    const parenMatch = line.match(/\((\d+(?:\.\d+)?)\)/);
    if (parenMatch) {
      const val = parseFloat(parenMatch[1]);
      if (val >= 1.0 && val <= 10.0) return val;
    }
    // 4. Fallback: entero 1-10 como posible valoración (OCR omitió el decimal)
    const intNums = line.match(/\b(\d+)\b/g);
    if (intNums) {
      for (const n of intNums) {
        const val = parseInt(n, 10);
        if (val >= 1 && val <= 10) return val;
      }
    }
  }
  return null;
}

/**
 * Parser principal: recibe texto OCR del panel de stats y devuelve objeto JSON
 */
function parseStats(statsOcrText, playerName = null, nameOcrText = null) {
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

  // Extraer valoración - el panel del nombre tiene 3x upscale, mejor resolución para dígitos
  let valFromName = nameOcrText ? extractValoracionFromName(nameOcrText) : null;
  let valFromStats = extractValoracion(statsOcrText);

  // Priorizar el panel del nombre (mejor resolución). Solo usar stats si name falla.
  if (valFromName !== null) {
    result.valoracion = valFromName;
    // Si ambos dan resultado y el de stats es más bajo (p.ej. 6.9 vs 9.9 en name),
    // posiblemente OCR confundió 6 con 9 en el name panel → preferir el de stats
    if (valFromStats !== null && valFromStats < valFromName) {
      const nameStr = valFromName.toFixed(1);
      const statsStr = valFromStats.toFixed(1);
      // Verificar si el valor de name se obtiene cambiando un 9 por 6 en stats
      if (nameStr.replace('9', '6') === statsStr || nameStr.replace('6', '9') === statsStr) {
        result.valoracion = valFromStats;
      }
    }
  } else if (valFromStats !== null) {
    result.valoracion = valFromStats;
  }

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

module.exports = { parseStats, extractSelectedPlayer, validateStats, extractValoracion, normalizePlayerName, CANONICAL_NAMES };
