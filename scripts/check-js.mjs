import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

const roots = ['src', 'api', 'scripts'];
const files = ['server.js'];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (path.endsWith('.js') || path.endsWith('.mjs')) files.push(path);
  }
}

for (const root of roots) walk(root);

let failed = false;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failed = true;
    process.stderr.write(`${relative(process.cwd(), file)}\n${result.stderr}`);
  }
}
if (failed) process.exit(1);
console.log(`JavaScript syntax OK (${files.length} files)`);
