'use strict';
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DEFAULTS = {
  trayEnabled: true,       // keep running in the notification area when the window is closed
  launchAtLogin: false,
  lowDiskAlert: true,      // notify when the system drive drops below 10% free
  tempAgeHours: 24,        // temp files newer than this are never touched
  motion: 'auto',          // 'auto' follows the OS animation setting, or 'on' / 'off'
  theme: 'system',         // 'system' | 'light' | 'dark'
  excludes: [],            // folders that are skipped by every scan
  totalFreed: 0,           // lifetime statistics
  cleanCount: 0,
  lastClean: 0,
};

let cache = null;
const file = () => path.join(app.getPath('userData'), 'settings.json');

function get() {
  if (!cache) {
    try { cache = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(file(), 'utf8')) }; } catch { cache = { ...DEFAULTS }; }
  }
  return cache;
}

function set(patch) {
  cache = { ...get(), ...patch };
  try {
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    fs.writeFileSync(file(), JSON.stringify(cache, null, 2));
  } catch { /* read-only profile */ }
  return cache;
}

function addFreed(bytes) {
  const s = get();
  return set({ totalFreed: s.totalFreed + Math.max(0, bytes || 0), cleanCount: s.cleanCount + 1, lastClean: Date.now() });
}

/** True when `p` lies inside one of the user's excluded folders. */
const isExcluded = (p) => require('./util.cjs').isUnder(p, get().excludes);

module.exports = { get, set, addFreed, isExcluded };
