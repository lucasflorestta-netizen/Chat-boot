import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = path.join(root, 'node_modules', 'dictionary-pt');
const dest = path.join(root, 'public', 'dictionaries', 'pt');
const requireDict = process.env.CC_REQUIRE_DICT === '1' || process.env.CC_REQUIRE_DICT === 'true';

if (!fs.existsSync(path.join(src, 'index.aff'))) {
  const msg = '[copy-dict] dictionary-pt not installed; skip';
  if (requireDict) {
    console.error(msg + ' (CC_REQUIRE_DICT=1)');
    process.exit(1);
  }
  console.warn(msg);
  process.exit(0);
}

fs.mkdirSync(dest, { recursive: true });
for (const file of ['index.aff', 'index.dic']) {
  fs.copyFileSync(path.join(src, file), path.join(dest, file));
}
console.log('[copy-dict] synced Portuguese dictionary to public/dictionaries/pt');
