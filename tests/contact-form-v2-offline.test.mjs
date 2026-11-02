import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(new URL(file, import.meta.url), 'utf8');
const contactHtml = fs.readFileSync(new URL('../../angular/src/app/pages/contact/contact.component.html', import.meta.url), 'utf8');

// Minivalidador en memoria para ejecutar el controlador real sin conexión externa ni Zod.
const z = {
  string() { return {
    kind: 'string', constraints: [],
    trim() { this.constraints.push(['trim']); return this; },
    min(n) { this.constraints.push(['min',n]); return this; },
    max(n) { this.constraints.push(['max',n]); return this; },
    email() { this.constraints.push(['email']); return this; },
    optional() { this.isOptional = true; return this; },
    default(v) { this.defaultValue = v; return this; }
  }; },
  enum(options) { return { kind: 'enum', options }; },
  object(shape) { return { safeParse(body) {
    const data = {};
    for (const [key, rule] of Object.entries(shape)) {
      let value = body[key];
      if (value === undefined && rule.defaultValue !== undefined) value = rule.defaultValue;
      if (value === undefined && rule.isOptional) continue;
      if (rule.kind === 'enum') {
        if (!rule.options.includes(value)) return {success:false};
      } else {
        if (typeof value !== 'string') return {success:false};
        for (const [operation,n] of rule.constraints) {
          if (operation === 'trim') value = value.trim();
          if (operation === 'min' && value.length < n) return {success:false};
          if (operation === 'max' && value.length > n) return {success:false};
          if (operation === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) return {success:false};
        }
      }
      data[key] = value;
    }
    return {success:true,data};
  } }; }
};
let lastSubmission;
let formStudyFails = false;
let enqueueCount = 0;
let lastQueuedSubmission;
let queuedAfterHttp;
const formReviewDeliveryService = { enqueue({submission,startAfter}) {enqueueCount++;lastQueuedSubmission=submission;queuedAfterHttp=startAfter;return true;} };
const securityService = { async assertCanAttemptContact(){}, async assertCanSubmitContact(){}, async recordEvent(){} };
const turnstileService = { async verify(){return {success:true};} };
const notificationService = { async notifyContact(submission){lastSubmission=submission;return {studyDelivered:!formStudyFails,clientDelivered:!formStudyFails,errors:formStudyFails?['Estudio: SMTP_STUDY_FAILED']:[]};} };
const source = read('../src/controllers/contact.controller.js')
  .replace(/^import .*?;\s*$/gm, '')
  .replace(/^export /gm, '');
const submitContact = Function('z','env','getClientIp','hashIp','securityService','turnstileService','notificationService','formReviewDeliveryService','randomUUID',source + '\nreturn submitContact;')(
  z,{TURNSTILE_CONTACT_ACTION:'legal_contact_form'},()=> '127.0.0.1',()=> 'ip-hash',securityService,turnstileService,notificationService,formReviewDeliveryService,()=> 'abcdef12-3456-7890-1234-567890abcdef'
);
function reply() { return {status:0,payload:null,code(status){this.status=status;return this;},send(payload){this.payload=payload;return this;}}; }
const base = {
  fullName:'Laura Gómez',phone:'1134567890',email:'laura@example.com',location:'CABA',
  consultationType:'Derecho del consumidor', consultationReason:'Cobros indebidos',
  caseDescription:'Di de baja mi cuenta y siguen facturando un seguro.'
};

test('el backend acepta el nuevo formulario sin checkbox de consentimiento', async()=>{
  const res = reply(); await submitContact({body:base},res);
  assert.equal(res.status,201);
  assert.equal(lastQueuedSubmission, lastSubmission);
  await queuedAfterHttp;
  assert.equal(lastSubmission.consultationReason,'Cobros indebidos');
  assert.equal(lastSubmission.consultationType,'Derecho del consumidor');
  for (const removed of ['coverageType','hasWrittenDenial','consentToContact']) assert.equal(removed in lastSubmission,false);
});

test('el backend acepta exactamente 21 caracteres en motivo y rechaza 22', async()=>{
  const accepted = reply(); await submitContact({body:{...base,consultationReason:'A'.repeat(21)}},accepted);
  assert.equal(accepted.status,201);
  const rejected = reply(); await submitContact({body:{...base,consultationReason:'A'.repeat(22)}},rejected);
  assert.equal(rejected.status,400);
  const blank = reply(); await submitContact({body:{...base,consultationReason:'   '}},blank);
  assert.equal(blank.status,400);
});

test('el backend no admite tipos de consulta antiguos o desconocidos', async()=>{
  const accepted=['Derecho a la salud','Derecho del consumidor','Daños y perjuicios','Derecho previsional','Derecho tributario','Otra consulta'];
  for(const type of accepted) {
    const res=reply();await submitContact({body:{...base,consultationType:type}},res);assert.equal(res.status,201,type);
  }
  const bad=reply();await submitContact({body:{...base,consultationType:'Cobertura parcial'}},bad);assert.equal(bad.status,400);
});

test('el formulario no espera Groq para confirmar la recepción', async () => {
  const res = reply(); await submitContact({body:base},res);
  assert.equal(res.status,201);
  assert.equal(lastQueuedSubmission.id, res.payload.id);
  assert.ok(queuedAfterHttp && typeof queuedAfterHttp.then === 'function');
});

test('si SMTP rechaza al estudio, no se lanza revisión ni se confirma al cliente', async () => {
  const oldCount=enqueueCount;
  formStudyFails=true;
  try {
    await assert.rejects(() => submitContact({body:base},reply()),error => error.code === 'STUDY_EMAIL_FAILED');
    assert.equal(enqueueCount,oldCount);
  } finally {
    formStudyFails=false;
  }
});

test('Angular muestra los seis tipos y no pide cobertura, negativa ni check', ()=>{
  const options=Array.from(contactHtml.matchAll(/<option value="([^"]+)">/g),m=>m[1]).filter(Boolean);
  assert.deepEqual(options,['Derecho a la salud','Derecho del consumidor','Daños y perjuicios','Derecho previsional','Derecho tributario','Otra consulta']);
  assert.match(contactHtml,/name="consultationReason"[\s\S]*?maxlength="21"/);
  assert.doesNotMatch(contactHtml,/coverageType|hasWrittenDenial|consentToContact|type="checkbox"/);
});

