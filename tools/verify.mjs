import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const scripts = [
  'check:structure',
  'check:boundaries',
  'check:rules',
  'typecheck',
  'lint',
  'format:check',
  'test:coverage',
];

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

let hasError = false;
for (const script of scripts) {
  console.log(`\n--- Running pnpm ${script} ---`);
  if (!pkg.scripts[script]) {
    console.log(`Skipping (not defined)`);
    continue;
  }
  try {
    execSync(`pnpm ${script}`, { stdio: 'inherit' });
  } catch (err) {
    console.error(`\n[ERROR] pnpm ${script} failed.`);
    // Don't exit immediately, let user see all failures if we wanted, but verify usually stops.
    process.exit(1);
  }
}

console.log('\nAll verify checks passed.');
