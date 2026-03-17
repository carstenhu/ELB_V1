import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname, relative } from "node:path";

const ROOT = "C:/ELB_V1";
const ALLOWED_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".css", ".md", ".json"]);
const IGNORED_DIRS = new Set([".git", "node_modules", "dist", "tmp_koller", "scripts"]);
const IGNORED_FILES = new Set([
  "packages/shared/src/mojibake.ts"
]);

const SUSPICIOUS_PATTERNS = [
  new RegExp("\u00C3"),
  new RegExp("\uFFFD"),
  /\?ffnet/g,
  /w\?hlen/g,
  /Stra\?e/g,
  /Sch\?tzung/g,
  /Nationalit\?t/g,
  /Beg\?nstigter/g,
  /hinzuf\?gen/g,
  /l\?schen/g
];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      if (!IGNORED_DIRS.has(entry)) {
        walk(fullPath, out);
      }
      continue;
    }

    if (ALLOWED_EXTENSIONS.has(extname(entry))) {
      out.push(fullPath);
    }
  }

  return out;
}

const files = walk(ROOT);
const findings = [];

for (const file of files) {
  const relPath = relative(ROOT, file).replaceAll("\\", "/");
  if (IGNORED_FILES.has(relPath)) {
    continue;
  }

  const text = readFileSync(file, "utf8");
  const lines = text.split(/\r?\n/);

  lines.forEach((line, index) => {
    if (SUSPICIOUS_PATTERNS.some((pattern) => pattern.test(line))) {
      findings.push(`${relPath}:${index + 1}: ${line.trim()}`);
    }
  });
}

if (findings.length) {
  console.error("Mojibake-Verdacht gefunden:");
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

console.log("Keine verdächtigen Mojibake-Muster gefunden.");
