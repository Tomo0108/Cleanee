'use strict';
const { psJson, ps } = require('./util.cjs');

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

const LIST_SCRIPT = String.raw`
$out=New-Object System.Collections.ArrayList
$sh=New-Object -ComObject WScript.Shell
function Get-Approved($hive,$sub,$name){
  try{ $v=(Get-ItemProperty -Path "$hive\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\$sub" -Name $name -ErrorAction Stop).$name; return (($v[0] % 2) -eq 0) }catch{ return $true }
}
function Get-Exe($cmd){
  if($cmd -match '^\s*"([^"]+)"'){ return $Matches[1] }
  if($cmd -match '^\s*(.+?\.(exe|bat|cmd|com))(\s|$)'){ return $Matches[1] }
  return ($cmd -split ' ')[0]
}
function Add-Item($name,$cmd,$source,$hive,$ak,$scope){
  $exe=[Environment]::ExpandEnvironmentVariables((Get-Exe $cmd))
  if($exe -like '*.lnk'){ try{ $exe=$sh.CreateShortcut($exe).TargetPath }catch{} }
  $desc='';$company=''
  try{ $vi=(Get-Item -LiteralPath $exe -ErrorAction Stop).VersionInfo; $desc=$vi.FileDescription; $company=$vi.CompanyName }catch{}
  [void]$out.Add([pscustomobject]@{name=$name;command=[string]$cmd;exe=$exe;description=[string]$desc;company=[string]$company;source=$source;hive=$hive;approvedKey=$ak;scope=$scope;enabled=(Get-Approved $hive $ak $name)})
}
$keys=@(
  @{hive='HKCU:';path='Software\Microsoft\Windows\CurrentVersion\Run';ak='Run';scope='user'},
  @{hive='HKLM:';path='Software\Microsoft\Windows\CurrentVersion\Run';ak='Run';scope='machine'},
  @{hive='HKLM:';path='Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run';ak='Run32';scope='machine'}
)
foreach($k in $keys){
  $p="$($k.hive)\$($k.path)"
  if(Test-Path $p){
    $item=Get-Item $p
    foreach($n in $item.GetValueNames()){ if($n -ne ''){ Add-Item $n ([string]$item.GetValue($n)) 'registry' $k.hive $k.ak $k.scope } }
  }
}
$folders=@(@{p=[Environment]::GetFolderPath('Startup');scope='user';hive='HKCU:'},@{p=[Environment]::GetFolderPath('CommonStartup');scope='machine';hive='HKLM:'})
foreach($f in $folders){
  if($f.p -and (Test-Path $f.p)){
    Get-ChildItem -LiteralPath $f.p -File | Where-Object { $_.Name -ne 'desktop.ini' } | ForEach-Object { Add-Item $_.Name $_.FullName 'folder' $f.hive 'StartupFolder' $f.scope }
  }
}
ConvertTo-Json -InputObject @($out.ToArray()) -Compress
`;

async function list() {
  return psJson(LIST_SCRIPT, []);
}

async function toggle(item, enable) {
  const key = `${item.hive}\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\${item.approvedKey}`;
  const script = `
$ErrorActionPreference='Stop'
try{
  $p=${q(key)}
  if(!(Test-Path $p)){ New-Item -Path $p -Force | Out-Null }
  if(${enable ? '$true' : '$false'}){ $b=[byte[]](2,0,0,0,0,0,0,0,0,0,0,0) }
  else { $b=[byte[]](@(3,0,0,0) + [BitConverter]::GetBytes([DateTime]::Now.ToFileTime())) }
  New-ItemProperty -Path $p -Name ${q(item.name)} -Value $b -PropertyType Binary -Force | Out-Null
  'ok'
}catch{ 'error: ' + $_.Exception.Message }`;
  const r = await ps(script);
  const text = r.stdout.trim();
  if (text === 'ok') return { ok: true };
  return { ok: false, error: item.scope === 'machine' ? 'この項目の変更には管理者権限が必要です。' : text.replace(/^error: /, '') };
}

module.exports = { list, toggle };
