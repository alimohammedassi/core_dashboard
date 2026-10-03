// Case-sensitivity scan v2 — resolves TRUE on-disk casing via readdir.
import fs from "node:fs";
import path from "node:path";

const bad = [];
const dirCache = new Map();
function trueCase(dir, name) {
  const key = dir.toLowerCase();
  if (!dirCache.has(key)) {
    try { dirCache.set(key, fs.readdirSync(dir)); } catch { dirCache.set(key, []); }
  }
  const entries = dirCache.get(key);
  const hit = entries.find((f) => f.toLowerCase() === name.toLowerCase())
    ?? entries.find((f) => f.toLowerCase().startsWith(name.toLowerCase() + "."));
  return hit ?? null; // true-case entry (file with ext, or dir)
}
function resolveTrue(spec) {
  const parts = spec.slice(2).split("/"); // "@/components/dashboard/Topbar"
  let dir = "src";
  let resolved = "src";
  for (let i = 0; i < parts.length; i++) {
    const hit = trueCase(dir, parts[i]);
    if (!hit) return null;
    resolved = path.join(resolved, hit);
    dir = resolved;
  }
  // file with extension, or directory with index
  for (const cand of [resolved, resolved + ".tsx", resolved + ".ts", path.join(resolved, "index.tsx"), path.join(resolved, "index.ts")]) {
    const dirPart = path.dirname(cand);
    const base = path.basename(cand);
    const hit = trueCase(dirPart, base);
    if (hit && fs.statSync(path.join(dirPart, hit)).isFile()) return path.join(dirPart, hit);
  }
  return null;
}
function scan(file) {
  const t = fs.readFileSync(file, "utf8");
  const re = /from\s+["'](@\/[^"']+)["']/g;
  let m;
  while ((m = re.exec(t))) {
    const r = resolveTrue(m[1]);
    if (r === null) { bad.push(`${file} -> ${m[1]} (MISSING)`); continue; }
    const norm = (s) => s.split(path.sep).join("/").replace(/\.(tsx|ts|jsx|js)$/, "").replace(/\/index$/, "");
    const actual = norm(r).replace(/^src\//, "");
    const specCase = m[1].slice(2);
    if (specCase !== actual && specCase.replace(/\/index$/, "") !== actual) {
      bad.push(`${file} -> ${m[1]} (case mismatch: true path ${actual})`);
    }
  }
}
function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (/\.(tsx|ts)$/.test(f)) scan(p);
  }
}
walk("src");
console.log(bad.length ? bad.join("\n") : "ALL IMPORTS RESOLVE CASE-SENSITIVELY");
