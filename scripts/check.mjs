import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const files = walk(path.resolve('src')).filter(file => file.endsWith('.js'));
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log(`Sintaxis OK: ${files.length} archivos JS.`);
