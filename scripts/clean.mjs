import { rmSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const targets = [
  "node_modules",
  "coverage",
  "apps/desktop/dist",
  "apps/desktop/node_modules",
  "packages/app-core/node_modules",
  "packages/domain/node_modules",
  "packages/export-core/node_modules",
  "packages/persistence/node_modules",
  "packages/pdf-core/node_modules",
  "packages/shared/node_modules",
  "packages/ui/node_modules",
  "packages/word-core/node_modules"
];

for (const target of targets) {
  rmSync(join(root, target), { recursive: true, force: true });
}
