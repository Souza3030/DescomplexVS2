import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnv } from 'vite';

export function loadLocalEnvironment(root, inherited = process.env) {
  // Match the production precedence: explicit shell variables override files.
  const env = { ...loadEnv('development', root, ''), ...inherited };
  const value = env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  // Local convenience: accept a private JSON file path without exposing its contents.
  // Production Netlify Functions still require the complete JSON in the variable.
  if (value && !value.startsWith('{')) {
    const filename = resolve(root, value);
    if (!value.endsWith('.json') || !existsSync(filename)) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON deve conter o JSON completo ou o caminho de um arquivo .json existente na pasta do projeto.');
    }
    env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify(JSON.parse(readFileSync(filename, 'utf8').replace(/^\uFEFF/, '')));
  }
  return env;
}
