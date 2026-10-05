// Renders scripts/icon/artwork.html to a 1024×1024 opaque PNG with Electron (Chromium).
// Usage: npx electron scripts/render-icon.cjs <out.png>
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const out = path.resolve(process.argv[process.argv.length - 1]);

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1024, height: 1024, useContentSize: true, show: false, frame: false,
    webPreferences: { offscreen: true, zoomFactor: 1 },
  });
  await win.loadFile(path.join(__dirname, 'icon', 'artwork.html'));
  await new Promise((r) => setTimeout(r, 600));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 });
  const sized = img.getSize().width === 1024 ? img : img.resize({ width: 1024, height: 1024, quality: 'best' });
  fs.writeFileSync(out, sized.toPNG());
  console.log('rendered', out, sized.getSize());
  app.quit();
});
