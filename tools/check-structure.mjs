import { getSourceFiles } from './lib/source-files.mjs';
import { parseDocTable } from './lib/doc-table.mjs';

const allowedFiles = parseDocTable('docs/02-directory-structure.md');
const srcFiles = getSourceFiles('src');

let hasError = false;
for (const file of srcFiles) {
  if (!allowedFiles.has(file)) {
    console.error(`[ERROR] Unauthorized file found: ${file}. Please add it to docs/02-directory-structure.md first.`);
    hasError = true;
  }
}

if (hasError) process.exit(1);
console.log('check-structure: OK');
