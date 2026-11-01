import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const required = [
  "index.html",
  "css/base.css",
  "css/app.css",
  "js/app.js",
  "js/embed-worker.js",
  "js/semantic.js",
  "js/store.js",
  "js/theme.js",
];

for (const file of required) {
  await access(resolve(root, file), constants.R_OK);
}

const html = await readFile(resolve(root, "index.html"), "utf8");
for (const asset of ["css/base.css", "css/app.css", "js/app.js"]) {
  if (!html.includes(asset)) throw new Error(`index.html does not reference ${asset}`);
}

const checks = ["js/app.js", "js/embed-worker.js", "js/semantic.js", "js/store.js", "js/theme.js"];
await Promise.all(checks.map((file) => new Promise((resolveCheck, reject) => {
  const child = spawn(process.execPath, ["--check", resolve(root, file)], { stdio: "inherit" });
  child.on("error", reject);
  child.on("exit", (code) => code === 0 ? resolveCheck() : reject(new Error(`Syntax check failed for ${file}`)));
})));

console.log(`Build check passed: ${required.length} required assets found and ${checks.length} modules parsed.`);
