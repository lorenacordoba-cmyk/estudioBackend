// Verificación estática, sin claves privadas, para el despliegue con Cloud Buildpacks.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = filename => fs.readFileSync(path.join(root, filename), 'utf8');
const packageJson = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const requiredFiles = [
  'package.json', 'package-lock.json', 'src/server.js', 'src/config/env.js',
  '.env.defaults', '.env.production.defaults', 'Dockerfile'
];

for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(root, file))) {
    throw new Error(`Falta el archivo requerido: ${file}`);
  }
}

if (packageJson.engines.node !== lock.packages[''].engines.node) {
  throw new Error('Las versiones de Node en package.json y package-lock.json no coinciden.');
}

if (!packageJson.scripts.start.includes('src/server.js') || packageJson.scripts.start.includes('scripts/start.mjs')) {
  throw new Error('npm start debe iniciar src/server.js directamente, sin scripts/start.mjs.');
}

const prodDefaults = read('.env.production.defaults');
for (const entry of [
  'NODE_ENV=production',
  'TURNSTILE_ENABLED=true',
  'TURNSTILE_EXPECTED_HOSTNAME=lorenacordobaabogada.com.ar',
  'TURNSTILE_CONTACT_ACTION=legal_contact_form',
  'FRONTEND_ORIGIN=https://lorenacordobaabogada.com.ar'
]) {
  if (!prodDefaults.split(/\r?\n/).includes(entry)) {
    throw new Error(`Configuración de producción faltante o distinta: ${entry}`);
  }
}

if (/^\s*(?:TURNSTILE_SECRET_KEY|GROQ_API_KEY|SECURITY_HASH_SECRET|SMTP_PASS)\s*=/m.test(prodDefaults)) {
  throw new Error('No incluyas secretos en .env.production.defaults.');
}

if (!read('.gitignore').includes('.env.production.defaults')) {
  throw new Error('El archivo .env.production.defaults debe poder versionarse en Git.');
}

console.log('Verificación Cloud Run OK: archivos, scripts, Node 22 y defaults de producción.');
