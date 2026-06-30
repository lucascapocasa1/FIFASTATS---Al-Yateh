const { createWorker } = require('tesseract.js');

let worker = null;

async function getWorker() {
  if (worker) return worker;

  worker = await createWorker('spa', 1, {
    logger: () => {} // silenciar logs
  });

  await worker.setParameters({
    tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,% áéíóúñÁÉÍÓÚÑ()',
    preserve_interword_spaces: '1',
  });

  return worker;
}

async function runOCR(imageBuffer) {
  const w = await getWorker();
  const { data } = await w.recognize(imageBuffer);
  return data.text;
}

async function terminateWorker() {
  if (worker) {
    await worker.terminate();
    worker = null;
  }
}

module.exports = { runOCR, terminateWorker };
