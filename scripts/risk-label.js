import { appendRiskLabel, ALLOWED_RISK_LABELS } from '../src/risk/label-store.js';

function usage() {
  console.error('Usage: npm run risk:label -- <eventId> <legit|abuse|needs_review> [notes...] [--reviewer=name] [--source-file=path]');
  process.exit(1);
}

const args = process.argv.slice(2);
const eventId = args.shift();
const label = args.shift();
if (!eventId || !label) usage();

let reviewer = null;
let sourceFile = null;
const noteParts = [];

for (const arg of args) {
  if (arg.startsWith('--reviewer=')) {
    reviewer = arg.slice('--reviewer='.length);
    continue;
  }
  if (arg.startsWith('--source-file=')) {
    sourceFile = arg.slice('--source-file='.length);
    continue;
  }
  noteParts.push(arg);
}

if (!ALLOWED_RISK_LABELS.has(String(label).trim().toLowerCase())) {
  console.error(`Unsupported label: ${label}`);
  console.error(`Allowed labels: ${Array.from(ALLOWED_RISK_LABELS).join(', ')}`);
  process.exit(1);
}

const result = appendRiskLabel({
  eventId,
  label,
  reviewer,
  sourceFile,
  notes: noteParts.length ? noteParts.join(' ') : null,
});

console.log(JSON.stringify(result, null, 2));
