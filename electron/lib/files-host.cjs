'use strict';
/**
 * Runs files.cjs in a long-lived worker thread. Walking and hashing hundreds of thousands of
 * files floods the event loop with fs callbacks; doing it on the main process would stall IPC
 * and make the whole app feel frozen. Space Lens keeps its index in the worker, so its queries
 * go through here too. If the worker cannot start, calls fall back to running in-process.
 */
const { Worker } = require('worker_threads');
const path = require('path');

let worker = null;
let broken = false;
let seq = 0;
const calls = new Map();

const local = (c) => require('./files.cjs')[c.method](...c.args, c.onProgress, c.signal || new AbortController().signal);

function failAll() {
  worker = null;
  broken = true;
  const pending = [...calls.values()];
  calls.clear();
  for (const c of pending) local(c).then(c.resolve, c.reject);
}

function getWorker() {
  if (worker || broken) return worker;
  try {
    // Loading through require() keeps asar paths working in packaged builds.
    worker = new Worker(`require(${JSON.stringify(path.join(__dirname, 'files-worker.cjs'))})`, { eval: true });
  } catch {
    broken = true;
    return null;
  }
  worker.on('message', (m) => {
    const c = calls.get(m.id);
    if (!c) return;
    if ('progress' in m) { c.onProgress(m.progress); return; }
    calls.delete(m.id);
    if (m.error) c.reject(new Error(m.error)); else c.resolve(m.result);
  });
  worker.on('error', failAll);
  worker.on('exit', () => { if (calls.size) failAll(); worker = null; });
  return worker;
}

function call(method, args = [], onProgress = () => {}, signal) {
  return new Promise((resolve, reject) => {
    const c = { method, args, onProgress, signal, resolve, reject };
    const w = getWorker();
    if (!w) { local(c).then(resolve, reject); return; }
    const id = ++seq;
    calls.set(id, c);
    w.postMessage({ id, method, args });
    signal?.addEventListener('abort', () => worker?.postMessage({ id, cancel: true }), { once: true });
  });
}

module.exports = {
  scanLarge: (opts, send, signal) => call('scanLarge', [opts], send, signal),
  scanDuplicates: (opts, send, signal) => call('scanDuplicates', [opts], send, signal),
  scanSpace: (root, send, signal) => call('scanSpace', [root], send, signal),
  spaceNode: (p) => call('spaceNode', [p]),
  spaceRemove: (paths) => call('spaceRemove', [paths]),
};
