'use strict';
// Worker-thread entry: runs file scans off the main process so the window stays responsive.
const { parentPort } = require('worker_threads');
const files = require('./files.cjs');

const controllers = new Map();

parentPort.on('message', async ({ id, method, args, cancel }) => {
  if (cancel) { controllers.get(id)?.abort(); return; }
  const ac = new AbortController();
  controllers.set(id, ac);
  try {
    const result = await files[method](...args, (progress) => parentPort.postMessage({ id, progress }), ac.signal);
    parentPort.postMessage({ id, result });
  } catch (e) {
    parentPort.postMessage({ id, error: String((e && e.message) || e) });
  } finally {
    controllers.delete(id);
  }
});
