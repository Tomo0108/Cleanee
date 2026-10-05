'use strict';
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { execFile, spawn } = require('child_process');

const env = (name, fallback = '') => process.env[name] || fallback;

const WIN = {
  get root() { return env('SystemRoot', 'C:\\Windows'); },
  get temp() { return env('TEMP', path.join(env('LOCALAPPDATA'), 'Temp')); },
  get local() { return env('LOCALAPPDATA'); },
  get roaming() { return env('APPDATA'); },
  get programData() { return env('ProgramData', 'C:\\ProgramData'); },
  get home() { return env('USERPROFILE', require('os').homedir()); },
  get systemDrive() { return env('SystemDrive', 'C:'); },
};

async function exists(p) {
  try { await fsp.access(p); return true; } catch { return false; }
}

async function safeStat(p) {
  try { return await fsp.lstat(p); } catch { return null; }
}

async function listDir(p) {
  try { return await fsp.readdir(p, { withFileTypes: true }); } catch { return []; }
}

/**
 * Recursively walks `root`, calling onFile(fullPath, stat) for each regular file.
 * Symlinks / junctions are never followed so we can't escape the root.
 */
async function walk(root, onFile, { signal, onDir, skipDir, concurrency = 16 } = {}) {
  const queue = [root];
  let active = 0;
  return new Promise((resolve) => {
    const pump = () => {
      if (signal?.aborted) { if (active === 0) resolve(); return; }
      while (active < concurrency && queue.length) {
        const dir = queue.pop();
        active++;
        processDir(dir).finally(() => { active--; pump(); });
      }
      if (active === 0 && queue.length === 0) resolve();
    };
    const processDir = async (dir) => {
      if (onDir) onDir(dir);
      const entries = await listDir(dir);
      for (const e of entries) {
        if (signal?.aborted) return;
        const full = path.join(dir, e.name);
        if (e.isSymbolicLink()) continue;
        if (e.isDirectory()) {
          if (skipDir && skipDir(full, e.name)) continue;
          queue.push(full);
        } else if (e.isFile()) {
          const st = await safeStat(full);
          if (st) await onFile(full, st);
        }
      }
    };
    pump();
  });
}

/** Deletes files permanently, then prunes now-empty directories below each root. */
async function deleteFiles(files, roots = []) {
  let freed = 0, removed = 0, failed = 0;
  const dirs = new Set();
  for (const f of files) {
    try {
      await fsp.unlink(f.path);
      freed += f.size; removed++;
      dirs.add(path.dirname(f.path));
    } catch {
      failed++;
    }
  }
  // Prune empty folders deepest-first, never removing the roots themselves.
  const rootSet = new Set(roots.map((r) => path.resolve(r).toLowerCase()));
  const sorted = [...dirs].sort((a, b) => b.length - a.length);
  for (let d of sorted) {
    while (d && !rootSet.has(path.resolve(d).toLowerCase()) && [...rootSet].some((r) => path.resolve(d).toLowerCase().startsWith(r + path.sep))) {
      try { await fsp.rmdir(d); } catch { break; }
      d = path.dirname(d);
    }
  }
  return { freed, removed, failed };
}

function run(file, args = [], opts = {}) {
  return new Promise((resolve) => {
    execFile(file, args, { windowsHide: true, maxBuffer: 64 * 1024 * 1024, encoding: 'utf8', ...opts }, (err, stdout, stderr) => {
      resolve({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, stdout: stdout || '', stderr: stderr || '', error: err });
    });
  });
}

/** Runs a PowerShell script and returns stdout. Output is forced to UTF-8. */
async function ps(script, opts = {}) {
  const full = `$ProgressPreference='SilentlyContinue';[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;\n${script}`;
  const encoded = Buffer.from(full, 'utf16le').toString('base64');
  return run('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], opts);
}

async function psJson(script, fallback = []) {
  const r = await ps(script);
  const text = r.stdout.trim();
  if (!text) return fallback;
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(fallback) && !Array.isArray(parsed)) return parsed == null ? [] : [parsed];
    return parsed;
  } catch {
    return fallback;
  }
}

/** Launches a command elevated (UAC prompt) in a visible console window. */
function runElevatedConsole(command) {
  const escaped = command.replace(/'/g, "''");
  return ps(`Start-Process -FilePath cmd.exe -Verb RunAs -ArgumentList '/k ${escaped}'`);
}

/**
 * Launches a command line through `start`, which uses ShellExecute so that
 * executables requiring elevation get a UAC prompt instead of failing.
 */
function spawnDetached(commandLine) {
  const child = spawn('cmd.exe', ['/d', '/s', '/c', `"start "" ${commandLine}"`], {
    detached: true, windowsHide: true, stdio: 'ignore', windowsVerbatimArguments: true,
  });
  child.unref();
}

async function isAdmin() {
  if (process.platform !== 'win32') return false;
  const r = await run('net', ['session']);
  return r.code === 0;
}

async function runningProcesses() {
  const r = await run('tasklist', ['/fo', 'csv', '/nh']);
  const names = new Set();
  for (const line of r.stdout.split(/\r?\n/)) {
    const m = line.match(/^"([^"]+)"/);
    if (m) names.add(m[1].toLowerCase());
  }
  return names;
}

module.exports = { WIN, env, exists, safeStat, listDir, walk, deleteFiles, run, ps, psJson, runElevatedConsole, spawnDetached, isAdmin, runningProcesses };
