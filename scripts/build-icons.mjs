// Builds every icon asset from the Melodee-style lime glass artwork.
// The source already includes its rounded silhouette; its outer margin is trimmed below.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
if (process.platform !== 'darwin') throw new Error('Icon regeneration uses macOS sips/swift. Other platforms use the committed assets.');

const output = resolve('build/icons');
mkdirSync(output, { recursive: true });
const source = resolve('scripts/icon/cleanee-lime.png');
const temp = mkdtempSync(join(tmpdir(), 'cleanee-icons-'));
const resize = (size, path, input = source) => execFileSync('sips', ['-z', String(size), String(size), input, '--out', path], { stdio: 'pipe' });

try {
  // The artwork has a wide transparent margin (content ≈81% of the canvas). Crop it centred so the
  // icon fills ≈94% like Videe, otherwise it looks small next to other apps on the taskbar.
  const cropped = join(temp, 'cropped.png');
  execFileSync('sips', ['--cropToHeightWidth', '1084', '1084', source, '--out', cropped], { stdio: 'pipe' });
  resize(1024, join(output, 'artwork.png'), cropped);
  const rounded = join(output, 'icon-rounded.png');
  copyFileSync(join(output, 'artwork.png'), rounded);
  for (const size of [32, 192, 256, 512]) resize(size, join(output, `icon-${size}.png`), rounded);
  // Window / tray icon used by Electron at runtime.
  copyFileSync(join(output, 'icon-512.png'), resolve('build/icon.png'));
  // In-app logo and favicon.
  mkdirSync(resolve('src/assets'), { recursive: true });
  mkdirSync(resolve('public'), { recursive: true });
  copyFileSync(join(output, 'icon-192.png'), resolve('src/assets/logo.png'));
  copyFileSync(join(output, 'icon-192.png'), resolve('public/favicon.png'));

  // ICNS with PNG payloads (avoids iconutil quirks on newer macOS).
  const icnsEntries = [['ic10', 1024], ['ic09', 512], ['ic08', 256], ['ic07', 128], ['icp6', 64], ['icp5', 32], ['icp4', 16]];
  const icnsChunks = icnsEntries.map(([type, size]) => {
    const path = join(temp, `icns-${size}.png`); resize(size, path, rounded);
    const image = readFileSync(path); const chunk = Buffer.alloc(8 + image.length);
    chunk.write(type, 0, 4, 'ascii'); chunk.writeUInt32BE(chunk.length, 4); image.copy(chunk, 8);
    return chunk;
  });
  const icns = Buffer.alloc(8); icns.write('icns', 0, 4, 'ascii'); icns.writeUInt32BE(8 + icnsChunks.reduce((sum, c) => sum + c.length, 0), 4);
  writeFileSync(join(output, 'Cleanee.icns'), Buffer.concat([icns, ...icnsChunks]));

  // Windows ICO with PNG-compressed entries.
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const images = sizes.map((size) => { const path = join(temp, `${size}.png`); resize(size, path, rounded); return readFileSync(path); });
  const header = Buffer.alloc(6 + 16 * sizes.length); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  images.forEach((png, i) => {
    const entry = 6 + i * 16;
    header[entry] = header[entry + 1] = sizes[i] === 256 ? 0 : sizes[i];
    header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8); header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  writeFileSync(join(output, 'Cleanee.ico'), Buffer.concat([header, ...images]));
  console.log('Generated Windows ICO, macOS ICNS and PNG icons from scripts/icon/cleanee-lime.png.');
} finally { rmSync(temp, { recursive: true, force: true }); }
