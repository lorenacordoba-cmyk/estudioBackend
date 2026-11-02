import test from 'node:test';
import assert from 'node:assert/strict';
import { buildClientEmailHtml, buildClientEmailText } from '../src/utils/client-email-template.js';

const sample = {
  studyName: 'Estudio Jurídico Lorena Córdoba',
  fullName: 'Cliente <script>alert(1)</script>',
  reference: 'ABCD1234', area: 'Derecho a la Salud',
  summary: 'La prepaga negó la autorización.\nHay orden médica.',
  documents: ['Orden médica', '<img src=x onerror=alert(1)>'],
  preferredContact: 'email', urgent: true
};
test('email responsive sigue la paleta de la web, sin exponer HTML de cliente/modelo', () => {
  const html = buildClientEmailHtml(sample);
  for (const color of ['#0B2D5C', '#0B4D9B', '#B78A3A']) assert.ok(html.includes(color));
  assert.ok(html.includes('width="600"'));
  assert.match(html, /@media only screen/);
  assert.doesNotMatch(html, /ABCD1234|Número de referencia/);
  assert.match(html, /LC/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;img src=x onerror/);
  assert.ok(html.includes('La prepaga negó la autorización.<br>Hay orden médica.'));
});
test('texto plano incluye el resumen y no expone la referencia', () => {
  const text = buildClientEmailText(sample);
  assert.doesNotMatch(text, /ABCD1234|Referencia:/);
  assert.match(text, /Orden médica/);
  assert.match(text, /recibimos tu consulta/i);
});
