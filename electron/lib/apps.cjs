'use strict';
const path = require('path');
const { WIN, psJson, run, spawnDetached, exists, walk, listDir } = require('./util.cjs');

const LIST_SCRIPT = String.raw`
$roots=@(
  @{p='HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall';scope='machine';arch='x64'},
  @{p='HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall';scope='machine';arch='x86'},
  @{p='HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall';scope='user';arch=''}
)
$out=@()
foreach($r in $roots){
  if(!(Test-Path $r.p)){continue}
  foreach($k in Get-ChildItem $r.p -ErrorAction SilentlyContinue){
    $v=Get-ItemProperty $k.PSPath -ErrorAction SilentlyContinue
    if(!$v.DisplayName -or $v.SystemComponent -eq 1 -or $v.ParentKeyName -or !$v.UninstallString){continue}
    if($v.ReleaseType -in @('Update','Hotfix','Security Update')){continue}
    $out+=[pscustomobject]@{
      id=$k.PSChildName+'|'+$r.p; name=[string]$v.DisplayName; version=[string]$v.DisplayVersion; publisher=[string]$v.Publisher;
      installDate=[string]$v.InstallDate; size=[int64]($v.EstimatedSize)*1024; uninstall=[string]$v.UninstallString;
      quietUninstall=[string]$v.QuietUninstallString; icon=[string]$v.DisplayIcon; location=[string]$v.InstallLocation; scope=$r.scope
    }
  }
}
ConvertTo-Json -InputObject @($out) -Compress
`;

let cache = [];

async function list() {
  const apps = await psJson(LIST_SCRIPT, []);
  const seen = new Set();
  cache = apps.filter((a) => {
    const key = `${a.name}|${a.version}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  return cache;
}

/** Extracts the executable path out of a DisplayIcon value such as `"C:\x\app.exe",0`. */
/**
 * Candidate files to take an app's icon from, best first:
 * DisplayIcon → the main executable in InstallLocation → the uninstaller.
 */
async function iconCandidates(app) {
  const out = [];
  const disp = (app.icon || '').trim().replace(/,\s*-?\d+$/, '').replace(/^"|"$/g, '');
  if (disp) out.push(disp);
  const loc = (app.location || '').replace(/^"|"$/g, '').replace(/\\$/, '');
  if (loc) {
    const exes = (await listDir(loc)).filter((e) => e.isFile() && /\.exe$/i.test(e.name) && !/^(unins|uninst|setup|update)/i.test(e.name));
    const key = app.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    exes.sort((a, b) => Number(key.includes(b.name.toLowerCase().replace(/\.exe$/, '').replace(/[^a-z0-9]/g, ''))) - Number(key.includes(a.name.toLowerCase().replace(/\.exe$/, '').replace(/[^a-z0-9]/g, ''))));
    exes.slice(0, 3).forEach((e) => out.push(path.join(loc, e.name)));
  }
  const m = (app.uninstall || '').match(/^"([^"]+\.exe)"|^(\S+\.exe)/i);
  if (m) out.push(m[1] || m[2]);
  const existing = [];
  for (const p of out) if (await exists(p)) existing.push(p);
  return existing;
}

/** Best match for a display name (used by the updater, which only knows winget names). */
function findByName(name) {
  const norm = (s) => s.toLowerCase().replace(/\(.*?\)|[^a-z0-9]/g, '');
  const n = norm(name);
  return cache.find((a) => norm(a.name) === n) || cache.find((a) => norm(a.name).startsWith(n) || n.startsWith(norm(a.name)));
}

async function uninstall(id) {
  const app = cache.find((a) => a.id === id);
  if (!app) return { ok: false, error: 'アプリが見つかりません' };
  let cmd = app.uninstall;
  // MSI packages: use /X (uninstall) instead of /I (modify) to go straight to removal.
  cmd = cmd.replace(/msiexec(\.exe)?\s+\/I/i, 'MsiExec.exe /X');
  if (!/^"/.test(cmd) && /^[a-z]:\\[^"]+\.exe\s/i.test(cmd) && /\s/.test(cmd.split('.exe')[0])) {
    // Unquoted path containing spaces: quote the executable part.
    const idx = cmd.toLowerCase().indexOf('.exe') + 4;
    cmd = `"${cmd.slice(0, idx)}"${cmd.slice(idx)}`;
  }
  spawnDetached(cmd);
  return { ok: true };
}

/** Folders that commonly remain after an uninstaller has run. */
async function leftovers(id) {
  const app = cache.find((a) => a.id === id);
  if (!app) return [];
  const names = new Set();
  const clean = (s) => (s || '').replace(/[\\/:*?"<>|]/g, '').replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+(x64|x86|64-bit|32-bit)$/i, '').trim();
  const name = clean(app.name);
  const base = name.replace(/\s+[\d.]+$/, '').trim();
  [name, base].filter((n) => n && n.length >= 3).forEach((n) => names.add(n));
  const publisher = clean(app.publisher).split(/[ ,]/)[0];

  const candidates = new Set();
  if (app.location) candidates.add(app.location.replace(/\\$/, ''));
  const parents = [WIN.roaming, WIN.local, WIN.local + 'Low', WIN.programData, process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean);
  for (const parent of parents) {
    for (const n of names) {
      candidates.add(path.join(parent, n));
      if (publisher && publisher.length >= 3) candidates.add(path.join(parent, publisher, n));
    }
  }
  const found = [];
  for (const c of candidates) {
    if (!(await exists(c))) continue;
    let size = 0, count = 0;
    await walk(c, (_p, st) => { size += st.size; count++; });
    found.push({ path: c, size, count });
  }
  return found;
}

async function stillInstalled(id) {
  const [key, root] = id.split('|');
  const r = await run('reg', ['query', `${root.replace(':', '')}\\${key}`]);
  return r.code === 0;
}

module.exports = { list, uninstall, leftovers, iconCandidates, findByName, stillInstalled, getCached: () => cache };
