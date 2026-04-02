import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const bundledPath = path.join(projectRoot, "public", "triomark.js");
if (!fs.existsSync(bundledPath)) {
  throw new Error(`Missing bundled file: ${bundledPath}`);
}
console.log(`triomark bundle already present at ${bundledPath}`);
console.log("Phase 2 keeps the browser bundle checked in while source modules are introduced under src/client/.");
