/** Panel temporal SIN BASE DE DATOS: el token nunca se almacena ni va en URL. */
export const dashboardHtml = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Operaciones · Estudio Jurídico AI</title>
<style>
:root{color-scheme:light}body{font:15px system-ui,sans-serif;background:#f3f6fb;color:#14243d;margin:0}
header{background:#0b2d5c;color:#fff;padding:24px max(20px,4vw)}main{max-width:1150px;margin:24px auto;padding:0 20px}
section{background:white;border:1px solid #dbe4ef;border-radius:12px;padding:20px;margin:18px 0}
input{padding:11px;max-width:360px;width:90%;border:1px solid #96a5b7;border-radius:7px}
button{border:0;border-radius:7px;padding:10px 14px;background:#0b4d9b;color:#fff;cursor:pointer}
button:hover{background:#123e78}table{border-collapse:collapse;width:100%;font-size:13px}th,td{border-bottom:1px solid #e0e6ef;padding:10px;text-align:left;overflow-wrap:anywhere}
.wrap{overflow-x:auto}.muted{color:#53657c}#error{color:#a02020}#stats{white-space:pre-wrap;font:13px ui-monospace,monospace}
</style></head><body><header><h1>Panel técnico · Estudio Jurídico AI</h1><p>Solo información operativa, sin datos de clientes. Las métricas de Groq viven en memoria.</p></header>
<main><section><label for="secret"><strong>Clave de operaciones</strong></label><p><input id="secret" type="password" autocomplete="off" placeholder="OPS_METRICS_TOKEN"/>
<button id="refresh">Actualizar</button></p><div id="error" role="alert"></div></section>
<section><h2>Indicadores</h2><div id="stats" class="muted">Ingresá la clave para consultar.</div></section>
</main><script src="/api/ops/dashboard.js" defer></script></body></html>`;

export const dashboardJs = `(() => {
  const el = id => document.getElementById(id);
  const secret = el('secret');
  const request = async (path, method='GET') => {
    const response = await fetch('/api/ops/' + path,{method,headers:{'x-ops-token':secret.value,'accept':'application/json'},cache:'no-store'});
    if(!response.ok) throw new Error('HTTP ' + response.status + ': ' + (response.status===403?'Clave inválida.':'Operación no disponible.'));
    return response.json();
  };
  const refresh = async () => {
    el('error').textContent='';
    try {
      const metrics = await request('metrics');
      el('stats').textContent = JSON.stringify({
        uptimeSeconds: metrics.uptimeSeconds,
        delivery: metrics.delivery,
        groqUsage: metrics.groqUsage,
        counters: metrics.counters,
        latency: metrics.latency
      }, null, 2);
    } catch(error){el('error').textContent=error.message;}
  };
  el('refresh').addEventListener('click',refresh);
})();`;
