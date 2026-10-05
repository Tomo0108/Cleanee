export function formatBytes(bytes: number, digits = 1): string {
  if (!bytes || bytes < 0) return '0 KB';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  if (i === 0) return `${Math.round(v)} B`;
  return `${v >= 100 ? Math.round(v) : v.toFixed(digits)} ${units[i]}`;
}

/** Splits into number + unit so the unit can be styled smaller. */
export function bytesParts(bytes: number): [string, string] {
  const s = formatBytes(bytes);
  const [n, u] = s.split(' ');
  return [n, u];
}

export function formatNumber(n: number) {
  return n.toLocaleString('ja-JP');
}

export function timeAgo(ms: number): string {
  const d = (Date.now() - ms) / 86400000;
  if (d < 1) return '今日';
  if (d < 2) return '昨日';
  if (d < 30) return `${Math.floor(d)} 日前`;
  if (d < 365) return `${Math.floor(d / 30)} か月前`;
  return `${Math.floor(d / 365)} 年以上前`;
}

export function formatDate(ms: number) {
  const d = new Date(ms);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

export function formatUptime(sec: number) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  return d ? `${d} 日 ${h} 時間` : `${h} 時間 ${Math.floor((sec % 3600) / 60)} 分`;
}

export const basename = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() || p;
export const dirname = (p: string) => p.replace(/[\\/][^\\/]*$/, '');

/** Shortens C:\Users\name\... to ~\... for display. */
export function prettyPath(p: string) {
  return p.replace(/^[A-Z]:\\Users\\[^\\]+/i, '~');
}
