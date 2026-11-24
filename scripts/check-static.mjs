import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const errors = [];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function isFile(rel) {
  const abs = path.resolve(root, rel);
  const relToRoot = path.relative(root, abs);
  if (relToRoot.startsWith("..") || path.isAbsolute(relToRoot)) return false;
  return fs.existsSync(abs) && fs.statSync(abs).isFile();
}

function checkManifest() {
  const rel = "manifest.webmanifest";
  let manifest;
  try {
    manifest = JSON.parse(read(rel));
  } catch (err) {
    errors.push(`manifest.webmanifest is not valid JSON (${err.message})`);
    return;
  }
  for (const key of ["name", "short_name", "start_url", "display"]) {
    if (typeof manifest[key] !== "string" || manifest[key].trim() === "") {
      errors.push(`manifest.webmanifest is missing a non-empty ${key}`);
    }
  }
  const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
  for (const size of ["192x192", "512x512"]) {
    const icon = icons.find((item) => String(item.sizes || "").split(/\s+/).includes(size) && item.src);
    if (!icon) {
      errors.push(`manifest.webmanifest has no icon with sizes ${size}`);
      continue;
    }
    const src = String(icon.src).replace(/^\.\//, "").split(/[?#]/)[0];
    if (!isFile(src)) errors.push(`manifest icon ${src} (${size}) is missing`);
  }
  const start = String(manifest.start_url || "");
  const startFile = start.replace(/^\.\//, "").split(/[?#]/)[0];
  if (startFile === "" || startFile.endsWith("/")) {
    if (!isFile("index.html")) errors.push("manifest start_url does not resolve to index.html");
  } else if (!isFile(startFile)) {
    errors.push(`manifest start_url ${start} does not exist`);
  }
}

const ASSET = /\.(?:html|css|js|mjs|webmanifest|png|jpe?g|webp|gif|svg|ico|json|txt|woff2?)$/i;
const SKIP = /^(?:board\/|ledger\.json$)/;
const refs = new Map();

function addRef(raw, from) {
  if (!raw || raw.includes("${")) return;
  const clean = String(raw).trim().replace(/^\.\//, "").split(/[?#]/)[0];
  if (!clean || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(clean) || clean.startsWith("/")) return;
  if (!ASSET.test(clean) || SKIP.test(clean)) return;
  if (!refs.has(clean)) refs.set(clean, from);
}

function collectQuoted(rel) {
  const text = read(rel);
  for (const match of text.matchAll(/["']([^"']+)["']/g)) addRef(match[1], rel);
}

function collectHtmlAttrs(rel) {
  const text = read(rel);
  for (const match of text.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) addRef(match[1], rel);
}

function collectCssUrls(rel) {
  const text = read(rel);
  for (const match of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) addRef(match[1], rel);
}

checkManifest();
collectHtmlAttrs("index.html");
collectQuoted("index.html");
collectQuoted("sw.js");
collectQuoted("app.js");
if (fs.existsSync(path.join(root, "styles.css"))) collectCssUrls("styles.css");

const seats = JSON.parse(read("data/seats.json"));
const shapes = ["base", "open", "mid", "blink"];
for (const advisor of seats.advisors || []) {
  for (const shape of shapes) addRef(`avatars/${advisor.key}-${shape}.webp`, "data/seats.json");
}
const sessions = JSON.parse(read("data/sessions.json"));
for (const session of sessions.sessions || []) {
  addRef(`data/sessions/${session.id}.json`, "data/sessions.json");
}

for (const [rel, from] of refs) {
  if (!isFile(rel)) errors.push(`${rel} (referenced from ${from}) does not exist`);
}

if (errors.length) {
  for (const err of errors) console.error(err);
  process.exit(1);
}
console.log(`manifest ok; ${refs.size} local assets exist`);
