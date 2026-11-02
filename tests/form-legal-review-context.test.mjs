import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FORM_LEGAL_AREAS, buildFormReviewContext } from '../src/utils/form-review-context.js';

const submission = {
  id:'12345678-aabb-ccdd-eeff-123456789012', receivedAt:'2026-10-28T19:00:00.000Z',
  fullName:'IDENTIDAD PRIVADA', phone:'TEL PRIVADO', email:'MAIL_PRIVADO@example.com',
  location:'CABA', consultationType:'Derecho a la salud', consultationReason:'Cirugía urgente',
  caseDescription:'La prepaga aún no autorizó la cirugía indicada.'
};

test('las seis opciones del formulario se corresponden con la skill del especialista', () => {
  for (const [label, area] of Object.entries(FORM_LEGAL_AREAS)) {
    assert.equal(buildFormReviewContext({...submission,consultationType:label}).triage.legalArea,area);
  }
});

test('el especialista recibe solo hechos del formulario y no datos de contacto', () => {
  const context = buildFormReviewContext(submission);
  assert.equal(context.session.sessionId,submission.id);
  assert.equal(context.triage.intakeChannel,'WEB_FORM');
  assert.equal(context.triage.urgency,'UNKNOWN');
  assert.equal(context.triage.legalArea,'HEALTH');
  assert.equal(context.session.transcript.length,1);
  const sentToModel=JSON.stringify(context);
  for (const secret of [submission.fullName, submission.phone, submission.email]) {
    assert.ok(!sentToModel.includes(secret),`Un dato de contacto llegó al experto: ${secret}`);
  }
  for (const value of [submission.consultationReason,submission.caseDescription,submission.location]) {
    assert.ok(sentToModel.includes(value),`Falta contexto relevante: ${value}`);
  }
});

test('reviewForm reutiliza exactamente el mismo método review() del especialista del chat', async () => {
  const source=fs.readFileSync(new URL('../src/services/legal-specialist.service.js',import.meta.url),'utf8')
    .replace(/^import .*?;\s*$/gm,'').replace(/^export /gm,'');
  const Service=Function('buildFormReviewContext',source+'\nreturn LegalSpecialistService;')(buildFormReviewContext);
  const instance=new Service();
  let called=null;
  instance.review=async context=>{called=context;return {professionalCaseSummary:'Informe simulado'};};
  const result=await instance.reviewForm({submission});
  assert.equal(result.professionalCaseSummary,'Informe simulado');
  assert.deepEqual(called,buildFormReviewContext(submission));
});
