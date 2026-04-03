import { seedDemoDataset } from '../src/risk/demo-seed.js';

function parseArgs(argv) {
  const args = { reset: false, reviewer: 'demo_seed' };
  for (const entry of argv) {
    if (entry === '--reset') args.reset = true;
    else if (entry.startsWith('--reviewer=')) args.reviewer = entry.slice('--reviewer='.length) || 'demo_seed';
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const result = await seedDemoDataset(args);
console.log(JSON.stringify(result, null, 2));
