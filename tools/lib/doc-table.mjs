import { readFileSync } from 'node:fs';

export function parseDocTable(filePath) {
  const content = readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const files = new Map();
  for (const line of lines) {
    if (line.startsWith('| `') || line.startsWith('|`')) {
      const parts = line.split('|').map(s => s.trim());
      if (parts.length >= 5) {
        const pathMatch = parts[1].match(/`(.*)`/);
        if (pathMatch) {
          files.set(pathMatch[1], {
            hot: parts[3] === 'HOT',
            task: parts[4]
          });
        }
      }
    }
  }
  return files;
}
