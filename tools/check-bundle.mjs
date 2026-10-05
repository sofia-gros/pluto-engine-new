import { readFileSync, existsSync } from 'node:fs';

let hasError = false;

function checkEmbed() {
  const file = 'dist/embed/pluto.js';
  if (!existsSync(file)) {
    console.error(`[ERROR] ${file} not found`);
    hasError = true;
    return;
  }
  const content = readFileSync(file, 'utf8');
  const forbidden = ['SharedArrayBuffer', 'new Worker', 'Atomics.wait'];
  for (const word of forbidden) {
    if (content.includes(word)) {
      console.error(`[ERROR] ${file} contains forbidden word: ${word}`);
      hasError = true;
    }
  }
}

function checkParallel() {
  const file = 'dist/parallel/pluto.js';
  if (!existsSync(file)) {
    console.error(`[ERROR] ${file} not found`);
    hasError = true;
    return;
  }
  const content = readFileSync(file, 'utf8');
  // T-2.2 以降で検査。それまではスキップ
  if (!content.includes('Atomics.wait')) {
    console.log(`[INFO] ${file}: Atomics.wait not found (Skipping check until T-2.2)`);
  }
}

checkEmbed();
checkParallel();

if (hasError) process.exit(1);
console.log('check-bundle: OK');
