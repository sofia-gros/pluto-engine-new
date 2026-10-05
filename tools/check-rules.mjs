import { getSourceFiles } from './lib/source-files.mjs';
import { readFileSync } from 'node:fs';
import { parseDocTable } from './lib/doc-table.mjs';

const allowedFiles = parseDocTable('docs/02-directory-structure.md');
const srcFiles = getSourceFiles('src');
let hasError = false;

for (const file of srcFiles) {
  const meta = allowedFiles.get(file);
  if (!meta) continue;
  
  const content = readFileSync(file, 'utf8');
  if (meta.hot) {
    if (!content.includes('// @pluto-hot')) {
      console.error(`[ERROR] ${file} is marked as HOT in docs but missing '// @pluto-hot' in line 1.`);
      hasError = true;
    }
  }
}

if (hasError) process.exit(1);
console.log('check-rules: OK');
