import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Se carga la clase sin importar servicios Groq/SMTP reales.
const source = fs.readFileSync(new URL('../src/services/form-review-delivery.service.js',import.meta.url),'utf8')
  .replace(/^import .*?;\s*$/gm,'')
  .replace(/^export /gm,'')
  .replace(/\nconst formReviewDeliveryService = new FormReviewDeliveryService\([\s\S]*?\);\s*$/,'');
const Service = Function('observability',source+'\nreturn FormReviewDeliveryService;')({event(){}});
const submission = {id:'12345678-aabb-ccdd-eeff-123456789012'};
const nextTick = () => new Promise(resolve=>setImmediate(resolve));

test('formulario no espera a Groq para responder, el informe se manda después del HTTP',async()=>{
  const events=[];
  let releaseHttp;
  const httpFinished=new Promise(resolve=>{releaseHttp=resolve;});
  const reviewer={async reviewForm(){events.push('review');return {professionalCaseSummary:'Informe'};}};
  const notifier={async sendStudyContactReviewEmail(){events.push('smtp-review');return {accepted:['study']};}};
  const worker=new Service({reviewer,notifier,logger:{warn(){}},schedule:fn=>setImmediate(fn)});
  assert.equal(worker.enqueue({submission,startAfter:httpFinished}),true);
  assert.equal(worker.enqueue({submission,startAfter:httpFinished}),false);
  assert.deepEqual(events,[]);
  releaseHttp();
  await nextTick(); await nextTick();
  assert.deepEqual(events,['review','smtp-review']);
  assert.deepEqual(worker.snapshot(),{pendingFormReviews:0});
});

test('si SMTP del informe falla, reutiliza la evaluación sin otra llamada Groq',async()=>{
  let reviewCalls=0;
  let deliveries=0;
  const worker=new Service({
    reviewer:{async reviewForm(){reviewCalls++;return {professionalCaseSummary:'Informe'};}},
    notifier:{async sendStudyContactReviewEmail(){deliveries++;if(deliveries===1) throw Object.assign(new Error('SMTP error'),{code:'SMTP_ERROR'});return {accepted:['study']};}},
    logger:{warn(){}},schedule:fn=>setImmediate(fn),maxAttempts:2,retryDelayMs:1
  });
  worker.enqueue({submission});
  await new Promise(resolve=>setTimeout(resolve,45));
  assert.equal(reviewCalls,1);
  assert.equal(deliveries,2);
  assert.equal(worker.snapshot().pendingFormReviews,0);
  worker.shutdown();
});

test('si Groq falla, el correo inicial no depende del segundo envío',async()=>{
  let deliveries=0;
  const worker=new Service({
    reviewer:{async reviewForm(){throw Object.assign(new Error('No disponible'),{code:'AI_FAILED'});}},
    notifier:{async sendStudyContactReviewEmail(){deliveries++;}},
    logger:{warn(){}},schedule:fn=>setImmediate(fn),maxAttempts:1
  });
  worker.enqueue({submission});
  await nextTick();await nextTick();
  assert.equal(deliveries,0);
  assert.equal(worker.snapshot().pendingFormReviews,0);
});
