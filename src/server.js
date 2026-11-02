import { buildApp } from './app.js';
import { env } from './config/env.js';

const app = await buildApp();
try {
  await app.listen({ host: '0.0.0.0', port: env.PORT });
  console.log(`Estudio Jurídico AI Fastify + Groq escuchando en puerto ${env.PORT}`);
} catch (error) {
  console.error('No se pudo iniciar Fastify:', error);
  process.exit(1);
}
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    await app.close();
    process.exit(0);
  });
}
