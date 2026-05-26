import { copyFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const env = process.argv[2];

if (!["dev", "prod"].includes(env)) {
  console.error("Usage: node scripts/use-config.js dev|prod");
  process.exit(1);
}

const source = resolve(`config.${env}.json`);
const target = resolve("config.json");

JSON.parse(readFileSync(source, "utf8"));
copyFileSync(source, target);

console.log(`Using ${source} -> ${target}`);
