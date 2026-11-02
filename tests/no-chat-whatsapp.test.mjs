import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('la web incorpora WhatsApp en todas las páginas y no monta asistente', () => {
  for (const page of ['home/home.component.html', 'specialty/specialty.component.html', 'contact/contact.component.html']) {
    const html = read('angular/src/app/pages/' + page);
    assert.match(html, /<app-whatsapp-contact\b/);
    assert.doesNotMatch(html, /<app-assistant\b|openAssistant\(/);
  }
  const c = read('angular/src/app/shared/whatsapp-contact/whatsapp-contact.component.ts');
  assert.match(c, /https:\/\/wa\.me\/5491131076843/);
  const template = read('angular/src/app/shared/whatsapp-contact/whatsapp-contact.component.html');
  assert.match(template, /target="_blank"/);
  assert.match(template, /rel="noopener noreferrer"/);
  const html = read('angular/src/app/pages/home/home.component.html');
  assert.match(html, /href="https:\/\/wa\.me\/5491131076843"/);
});

test('Fastify no registra rutas ni importaciones de entrevista; conserva formulario e informes', () => {
  const app = read('backend/src/app.js');
  assert.doesNotMatch(app, /aiRoutes|sessionService|consultationDeliveryService/);
  assert.match(app, /contactRoutes/);
  assert.match(app, /formReviewDeliveryService/);
  const prompt = read('backend/src/prompts/lawyer-specialist.prompt.js');
  assert.match(prompt, /EVALUACIÓN PROFESIONAL DEL FORMULARIO/);
  for (const obsolete of [
    'backend/src/routes/ai.routes.js',
    'backend/src/services/triage-engine.js',
    'backend/src/prompts/triage.prompt.js',
    'backend/src/prompts/skills/health.prompt.js',
    'backend/src/services/session.service.js'
  ]) {
    assert.equal(fs.existsSync(path.join(root, obsolete)), false, obsolete);
  }
  assert.equal(fs.existsSync(path.join(root, 'backend/src/prompts/lawyer-skills/health.lawyer.prompt.js')), true);
});

test('panel técnico no expone sesiones ni posibilidad de reintento del chat', () => {
  const ops = read('backend/src/routes/ops.routes.js');
  assert.doesNotMatch(ops, /\/consultations|\/retry\//);
  assert.match(ops, /formReviewDeliveryService\.snapshot/);
});
