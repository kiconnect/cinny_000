import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import process from 'node:process';

import { deploymentFromEnv, readDeploymentEnv } from './kiconnect-deployment.js';

const [, , action, ...args] = process.argv;
const supportedActions = new Set(['build', 'preview', 'serve']);
if (!supportedActions.has(action)) {
  console.error('Aufruf: node scripts/run-deployment.js build|preview|serve [--env-file=DATEI]');
  process.exit(1);
}

const envFileArg = args.find((arg) => arg.startsWith('--env-file='));
const envFile =
  envFileArg?.slice('--env-file='.length) || process.env.KICONNECT_ENV_FILE || '.env.local';
const viteArgs = args.filter((arg) => arg !== envFileArg);

let loaded;
let deployment;
try {
  loaded = readDeploymentEnv(envFile);
  deployment = deploymentFromEnv(loaded.values);
} catch (error) {
  console.error(`[KIconnect deployment] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const viteExecutable = resolve('node_modules/.bin/vite');
const commandArgs = action === 'serve' ? [] : [action];
commandArgs.push('--mode', `kiconnect-${deployment.deployment}`, ...viteArgs);

console.log(
  `[KIconnect deployment] ${action} profile=${deployment.deployment} host=${deployment.hostname} output=${deployment.outDir}`
);

const result = spawnSync(viteExecutable, commandArgs, {
  stdio: 'inherit',
  env: {
    ...process.env,
    ...loaded.values,
    KICONNECT_ENV_FILE: loaded.filePath,
  },
});

if (result.error) {
  console.error(`[KIconnect deployment] ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
