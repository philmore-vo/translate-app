const fs = require('fs');
const path = require('path');

const LOCALES_TO_KEEP = new Set([
  'en-US.pak',
]);

exports.default = async function afterPack(context) {
  pruneElectronLocales(context.appOutDir);
};

function pruneElectronLocales(appOutDir) {
  const localesDir = path.join(appOutDir, 'locales');
  if (!fs.existsSync(localesDir)) return;

  for (const entry of fs.readdirSync(localesDir)) {
    if (LOCALES_TO_KEEP.has(entry)) continue;
    const fullPath = path.join(localesDir, entry);
    const stat = fs.statSync(fullPath);
    if (stat.isFile()) {
      fs.unlinkSync(fullPath);
    }
  }
}
