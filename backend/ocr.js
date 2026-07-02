const { createWorker } = require('tesseract.js');

const POOL_SIZE = 3;
let pool = [];
let ready = false;

async function getPool() {
  if (ready) return pool;

  for (let i = 0; i < POOL_SIZE; i++) {
    const worker = await createWorker('spa', 1, {
      logger: () => {}
    });
    await worker.setParameters({
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,% áéíóúñÁÉÍÓÚÑ()',
      preserve_interword_spaces: '1',
    });
    pool.push({ worker, inUse: false });
  }
  ready = true;
  return pool;
}

async function acquireWorker() {
  const p = await getPool();
  while (true) {
    for (const entry of p) {
      if (!entry.inUse) {
        entry.inUse = true;
        return entry;
      }
    }
    await new Promise(r => setTimeout(r, 50));
  }
}

async function runOCR(imageBuffer) {
  const entry = await acquireWorker();
  try {
    const { data } = await entry.worker.recognize(imageBuffer);
    return data.text;
  } finally {
    entry.inUse = false;
  }
}

async function terminateWorkers() {
  for (const entry of pool) {
    await entry.worker.terminate();
  }
  pool = [];
  ready = false;
}

module.exports = { runOCR, terminateWorkers };
