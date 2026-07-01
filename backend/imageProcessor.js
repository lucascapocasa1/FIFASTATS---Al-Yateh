const sharp = require('sharp');

/**
 * Recorta la zona derecha de la imagen FIFA (panel de estadísticas).
 * La pantalla de Rendimiento tiene:
 *  - Panel izquierdo (lista de jugadores): ~0% a ~38% del ancho
 *  - Panel central (heatmap): ~38% a ~68% del ancho  
 *  - Panel derecho (estadísticas): ~68% en adelante
 * 
 * También recortamos el header superior (~12%) que no tiene stats útiles.
 */
async function cropStatsPanel(inputBuffer) {
  const image = sharp(inputBuffer);
  const metadata = await image.metadata();

  const { width, height } = metadata;

  // Zona de estadísticas: parte derecha de la imagen
  const leftPercent = 0.62;  // empieza en 62% del ancho
  const topPercent = 0.10;   // salta el header (10%)

  const cropLeft = Math.floor(width * leftPercent);
  const cropTop = Math.floor(height * topPercent);
  const cropWidth = width - cropLeft;
  const cropHeight = height - cropTop;

  const croppedBuffer = await sharp(inputBuffer)
    .extract({
      left: cropLeft,
      top: cropTop,
      width: cropWidth,
      height: cropHeight
    })
    // Escalar para mejorar OCR (Tesseract funciona mejor con imágenes más grandes)
    .resize({ width: cropWidth * 3, height: cropHeight * 3, fit: 'fill' })
    // Mejorar contraste para texto claro sobre fondo oscuro
    .greyscale()
    .normalise()
    .linear(1.5, -30)
    .threshold()
    .sharpen()
    .toBuffer();

  return croppedBuffer;
}

/**
 * Recorta solo la zona del nombre del jugador (panel superior izquierdo-centro).
 * El nombre aparece arriba a la izquierda junto a la valoración.
 */
async function cropPlayerName(inputBuffer) {
  const image = sharp(inputBuffer);
  const metadata = await image.metadata();
  const { width, height } = metadata;

  // Zona del nombre del jugador: parte superior izquierda
  const cropLeft = Math.floor(width * 0.02);
  const cropTop = Math.floor(height * 0.08);
  const cropWidth = Math.floor(width * 0.42);
  const cropHeight = Math.floor(height * 0.22);

  const croppedBuffer = await sharp(inputBuffer)
    .extract({
      left: cropLeft,
      top: cropTop,
      width: cropWidth,
      height: cropHeight
    })
    .resize({ width: cropWidth * 3, height: cropHeight * 3, fit: 'fill' })
    .greyscale()
    .normalise()
    .sharpen()
    .toBuffer();

  return croppedBuffer;
}

module.exports = { cropStatsPanel, cropPlayerName };
