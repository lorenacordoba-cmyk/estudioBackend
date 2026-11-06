// Arranque multiplataforma: package.json define explícitamente el entorno.
const mode = process.argv[2];
if (!['development', 'production'].includes(mode)) {
  console.error('Modo inválido. Usá development o production.');
  process.exit(1);
}
process.env.NODE_ENV = mode;
await import('../src/server.js');
