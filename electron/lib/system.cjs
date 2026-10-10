'use strict';
const os = require('os');
const fs = require('fs');
const path = require('path');
const { WIN, run, ps, psJson, runElevatedConsole, isAdmin } = require('./util.cjs');

/* ---------------- Live system stats ---------------- */

let prevCpu = os.cpus();
function cpuLoad() {
  const cur = os.cpus();
  let idle = 0, total = 0;
  cur.forEach((c, i) => {
    const p = prevCpu[i] || c;
    const t = (k) => c.times[k] - p.times[k];
    const sum = t('user') + t('nice') + t('sys') + t('idle') + t('irq');
    total += sum; idle += t('idle');
  });
  prevCpu = cur;
  return total > 0 ? Math.max(0, Math.min(1, 1 - idle / total)) : 0;
}

/**
 * Local fixed disks (DriveType 3) and removable media such as USB drives / SD cards (DriveType 2).
 * USB hard disks report as fixed; BusType from Get-Disk tells them apart. Refreshed every 20 s
 * so drives plugged in later appear without restarting.
 */
let drives = null;
let drivesAt = 0;
const DRIVES_SCRIPT = String.raw`
$usb=@{}
try{ Get-Partition -ErrorAction Stop | Where-Object DriveLetter | ForEach-Object { $d=Get-Disk -Number $_.DiskNumber; if($d.BusType -in 'USB','SD','MMC'){ $usb[[string]$_.DriveLetter+':']=$true } } }catch{}
ConvertTo-Json -Compress -InputObject @(Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=2 OR DriveType=3' | Where-Object { $_.Size -gt 0 } | ForEach-Object {
  [pscustomobject]@{ id=$_.DeviceID; label=[string]$_.VolumeName; external=($_.DriveType -eq 2 -or $usb.ContainsKey($_.DeviceID)) }
})`;
async function listDrives() {
  if (!drives || Date.now() - drivesAt > 20000) {
    const list = await psJson(DRIVES_SCRIPT, []);
    const sys = WIN.systemDrive.toUpperCase();
    drives = list.map((d) => ({
      mount: d.id + '\\', system: d.id.toUpperCase() === sys, external: !!d.external,
      label: d.label || (d.external ? 'リムーバブル ディスク' : 'ローカル ディスク'),
    })).sort((a, b) => Number(b.system) - Number(a.system) || a.mount.localeCompare(b.mount));
    if (!drives.length) drives = [{ mount: WIN.systemDrive + '\\', label: 'ローカル ディスク', system: true, external: false }];
    drivesAt = Date.now();
  }
  const out = [];
  for (const d of drives) {
    try {
      const s = await fs.promises.statfs(d.mount);
      out.push({ ...d, total: s.blocks * s.bsize, free: s.bavail * s.bsize });
    } catch { /* drive removed */ }
  }
  return out;
}

let staticInfo = null;
async function info() {
  if (!staticInfo) {
    const osInfo = await psJson(`Get-CimInstance Win32_OperatingSystem | Select-Object Caption,Version,BuildNumber | ConvertTo-Json -Compress`, {});
    staticInfo = {
      hostname: os.hostname(),
      user: os.userInfo().username,
      os: osInfo.Caption || `Windows ${os.release()}`,
      build: osInfo.BuildNumber || '',
      cpuModel: (os.cpus()[0]?.model || '').replace(/\s+/g, ' ').trim(),
      cores: os.cpus().length,
      admin: await isAdmin(),
    };
  }
  return {
    ...staticInfo,
    cpu: cpuLoad(),
    memTotal: os.totalmem(),
    memFree: os.freemem(),
    uptime: os.uptime(),
    drives: await listDrives(),
  };
}

/* ---------------- Maintenance ---------------- */

const FREE_RAM_SCRIPT = String.raw`
Add-Type -Namespace Cleanee -Name Native -MemberDefinition '[DllImport("psapi.dll")] public static extern bool EmptyWorkingSet(IntPtr hProcess);'
$n=0
foreach($p in Get-Process){ try{ if([Cleanee.Native]::EmptyWorkingSet($p.Handle)){$n++} }catch{} }
$n`;

const TASKS = {
  freeRam: {
    run: async () => {
      const before = os.freemem();
      const r = await ps(FREE_RAM_SCRIPT);
      await new Promise((res) => setTimeout(res, 800));
      const gained = Math.max(0, os.freemem() - before);
      return { ok: true, message: `${parseInt(r.stdout, 10) || 0} 個のプロセスのメモリを整理しました`, freed: gained };
    },
  },
  flushDns: {
    run: async () => {
      const r = await run('ipconfig', ['/flushdns']);
      return { ok: r.code === 0, message: r.code === 0 ? 'DNS キャッシュを消去しました' : 'DNS キャッシュの消去に失敗しました' };
    },
  },
  rebuildThumbs: {
    run: async () => {
      const dir = path.join(WIN.local, 'Microsoft', 'Windows', 'Explorer');
      await run('taskkill', ['/f', '/im', 'explorer.exe']);
      await new Promise((res) => setTimeout(res, 1200));
      let removed = 0, freed = 0;
      for (const f of await fs.promises.readdir(dir).catch(() => [])) {
        if (!/^(thumbcache|iconcache)_.*\.db$/i.test(f)) continue;
        const p = path.join(dir, f);
        try { const st = await fs.promises.stat(p); await fs.promises.unlink(p); removed++; freed += st.size; } catch { /* in use */ }
      }
      try { await fs.promises.unlink(path.join(WIN.local, 'IconCache.db')); } catch { /* none */ }
      require('child_process').spawn('explorer.exe', [], { detached: true, stdio: 'ignore' }).unref();
      return { ok: true, message: `${removed} 個のキャッシュファイルを再構築しました`, freed };
    },
  },
  restartExplorer: {
    run: async () => {
      await run('taskkill', ['/f', '/im', 'explorer.exe']);
      await new Promise((res) => setTimeout(res, 800));
      require('child_process').spawn('explorer.exe', [], { detached: true, stdio: 'ignore' }).unref();
      return { ok: true, message: 'エクスプローラーを再起動しました' };
    },
  },
  restorePoint: {
    elevated: true,
    run: async () => {
      await ps(`Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile -Command "Checkpoint-Computer -Description ''Cleanee'' -RestorePointType MODIFY_SETTINGS; Write-Host 完了しました。; Start-Sleep 3"'`);
      return { ok: true, message: '復元ポイントの作成を開始しました' };
    },
  },
  trim: {
    elevated: true,
    run: async () => {
      const letter = WIN.systemDrive.replace(':', '');
      await runElevatedConsole(`powershell -NoProfile -Command "Optimize-Volume -DriveLetter ${letter} -ReTrim -Verbose"`);
      return { ok: true, message: 'ドライブの最適化を開始しました' };
    },
  },
  sfc: {
    elevated: true,
    run: async () => { await runElevatedConsole('sfc /scannow'); return { ok: true, message: 'システムファイルの検査を開始しました' }; },
  },
  dism: {
    elevated: true,
    run: async () => { await runElevatedConsole('DISM /Online /Cleanup-Image /RestoreHealth'); return { ok: true, message: 'Windows イメージの修復を開始しました' }; },
  },
  componentCleanup: {
    elevated: true,
    run: async () => { await runElevatedConsole('DISM /Online /Cleanup-Image /StartComponentCleanup'); return { ok: true, message: 'コンポーネントストアのクリーンアップを開始しました' }; },
  },
  chkdsk: {
    elevated: true,
    run: async () => { await runElevatedConsole(`chkdsk ${WIN.systemDrive} /scan`); return { ok: true, message: 'ディスクのエラーチェックを開始しました' }; },
  },
};

async function runTask(id) {
  const t = TASKS[id];
  if (!t) return { ok: false, message: '不明なタスクです' };
  try { return await t.run(); } catch (e) { return { ok: false, message: String(e.message || e) }; }
}

/* ---------------- Protection (Microsoft Defender) ---------------- */

async function defenderStatus() {
  const s = await psJson(String.raw`
try{
  $s=Get-MpComputerStatus -ErrorAction Stop
  $t=@(Get-MpThreatDetection -ErrorAction SilentlyContinue | Sort-Object InitialDetectionTime -Descending | Select-Object -First 20)
  $names=@{}; Get-MpThreat -ErrorAction SilentlyContinue | ForEach-Object { $names[[string]$_.ThreatID]=@{name=$_.ThreatName;severity=$_.SeverityID;category=$_.CategoryID;executed=$_.DidThreatExecute} }
  [pscustomobject]@{
    available=$true; antivirus=$s.AntivirusEnabled; realtime=$s.RealTimeProtectionEnabled; service=$s.AMServiceEnabled;
    signatureAge=$s.AntivirusSignatureAge; signatureVersion=$s.AntivirusSignatureVersion;
    signatureUpdated=([DateTimeOffset]$s.AntivirusSignatureLastUpdated).ToUnixTimeMilliseconds();
    quickScanAge=$s.QuickScanAge; fullScanAge=$s.FullScanAge;
    lastQuickScan=$(if($s.QuickScanEndTime){([DateTimeOffset]$s.QuickScanEndTime).ToUnixTimeMilliseconds()}else{0});
    threats=@($t | ForEach-Object { $n=$names[[string]$_.ThreatID]; [pscustomobject]@{ id=[string]$_.ThreatID; name=[string]$n.name; severity=[int]$n.severity; category=[int]$n.category; executed=[bool]$n.executed; resources=@($_.Resources); time=([DateTimeOffset]$_.InitialDetectionTime).ToUnixTimeMilliseconds(); status=[int]$_.ThreatStatusID; source=[int]$_.DetectionSourceTypeID; action=[int]$_.CleaningActionID; actionSuccess=[bool]$_.ActionSuccess; process=[string]$_.ProcessName; user=[string]$_.DomainUser; remediated=$(if($_.RemediationTime){([DateTimeOffset]$_.RemediationTime).ToUnixTimeMilliseconds()}else{0}) } })
  } | ConvertTo-Json -Depth 5 -Compress
}catch{ '{"available":false}' }`, { available: false });
  return s;
}

function mpcmdrun() {
  return path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Windows Defender', 'MpCmdRun.exe');
}

async function defenderScan(type) {
  const r = await run(mpcmdrun(), ['-Scan', '-ScanType', type === 'full' ? '2' : '1'], { timeout: 0 });
  // MpCmdRun exit code 2 = threats found
  return { ok: r.code === 0 || r.code === 2, threats: r.code === 2, output: r.stdout.slice(-2000) };
}

async function defenderUpdate() {
  const r = await run(mpcmdrun(), ['-SignatureUpdate']);
  if (r.code === 0) return { ok: true };
  await ps(`Start-Process '${mpcmdrun()}' -Verb RunAs -ArgumentList '-SignatureUpdate' -WindowStyle Hidden -Wait`);
  return { ok: true };
}

async function defenderRemoveThreats() {
  await ps(`Start-Process powershell -Verb RunAs -WindowStyle Hidden -Wait -ArgumentList '-NoProfile -Command Remove-MpThreat'`);
  return { ok: true };
}

/* ---------------- Updater (winget) ---------------- */

const isWide = (cp) => (cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe4f) || (cp >= 0xff00 && cp <= 0xff60) || (cp >= 0xffe0 && cp <= 0xffe6) || (cp >= 0x20000 && cp <= 0x3fffd);

/** Splits a line into display-width columns (winget pads CJK text by display width). */
function sliceByWidth(line, starts) {
  const cols = starts.map(() => '');
  let w = 0;
  for (const ch of line) {
    let idx = 0;
    for (let i = 0; i < starts.length; i++) if (w >= starts[i]) idx = i;
    cols[idx] += ch;
    w += isWide(ch.codePointAt(0)) ? 2 : 1;
  }
  return cols.map((c) => c.trim());
}

function parseWinget(stdout) {
  const lines = stdout.split(/\n/).map((l) => l.split('\r').pop().replace(/\s+$/, ''));
  const dash = lines.findIndex((l) => /^-{10,}$/.test(l.trim()));
  if (dash < 1) return [];
  const header = lines[dash - 1].replace(/^[^\p{L}]+/u, '');
  const starts = [];
  let w = 0, inWord = false;
  for (const ch of header) {
    if (ch !== ' ' && !inWord) { starts.push(w); inWord = true; }
    if (ch === ' ') inWord = false;
    w += isWide(ch.codePointAt(0)) ? 2 : 1;
  }
  const out = [];
  for (let i = dash + 1; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim()) break;
    const cols = sliceByWidth(l, starts);
    if (cols.length < 4 || !cols[1] || /\s/.test(cols[1]) || !cols[2] || !cols[3]) continue;
    out.push({ name: cols[0], id: cols[1], version: cols[2], available: cols[3], source: cols[4] || '' });
  }
  return out;
}

async function listUpdates() {
  const r = await run('winget', ['upgrade', '--include-unknown', '--accept-source-agreements', '--disable-interactivity']);
  if (r.error && r.error.code === 'ENOENT') return { available: false, items: [] };
  return { available: true, items: parseWinget(r.stdout) };
}

async function installUpdate(id) {
  const r = await run('winget', ['upgrade', '--id', id, '--exact', '--silent', '--accept-source-agreements', '--accept-package-agreements', '--disable-interactivity'], { timeout: 30 * 60 * 1000 });
  return { ok: r.code === 0, message: r.code === 0 ? '' : (r.stdout.split(/\r?\n/).filter(Boolean).pop() || 'アップデートに失敗しました') };
}

module.exports = { info, runTask, defenderStatus, defenderScan, defenderUpdate, defenderRemoveThreats, listUpdates, installUpdate, parseWinget };
