import { readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

export function getSourceFiles(dir = 'src') {
  if (!existsSync(dir)) return [];
  let results = [];
  const list = readdirSync(dir);
  for (const file of list) {
    const filePath = join(dir, file);
    const stat = statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getSourceFiles(filePath));
    } else {
      if (filePath.endsWith('.ts')) {
        results.push(filePath.replace(/\\/g, '/'));
      }
    }
  }
  return results;
}
