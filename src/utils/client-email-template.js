import { escapeHtml } from './html.js';

// Paleta idéntica a la web Angular: navy #0B2D5C, azul #0B4D9B,
// azul claro #2563B9 y dorado #B78A3A. Maquetación con tablas y estilos inline
// para Outlook, Gmail y clientes de correo móviles.
const NAVY = '#0B2D5C';
const BLUE = '#0B4D9B';
const GOLD = '#B78A3A';
const DARK = '#17253A';
const MUTED = '#55657B';

function paragraph(value) {
  // No interpretar HTML de entradas provenientes del modelo o del cliente.
  return escapeHtml(String(value ?? '')).replace(/\r?\n/g, '<br>');
}

function documentList(values) {
  const items = Array.isArray(values)
    ? values.filter(value => typeof value === 'string' && value.trim()).slice(0, 12)
    : [];
  if (!items.length) return '';
  return `<ul style="margin:0;padding:0 0 0 22px;color:${DARK};font-size:14px;line-height:1.8">${items.map(value => `<li style="margin:0 0 5px">${paragraph(value)}</li>`).join('')}</ul>`;
}

/** HTML seguro y adaptable; sin fuentes remotas, imágenes externas ni CSS necesario. */
export function buildClientEmailHtml({ studyName, fullName, area, summary, documents = [], preferredContact, urgent = false, administrativeOnly = false }) {
  const safeStudy = paragraph(studyName);
  const safeName = paragraph(fullName);
  const safeArea = paragraph(area || 'Consulta jurídica');
  const contact = preferredContact ? ` por ${paragraph(preferredContact)}` : '';
  const intro = administrativeOnly
    ? 'Recibimos la consulta que enviaste mediante nuestro formulario de contacto. Un profesional del estudio revisará la información que compartiste.'
    : 'Gracias por comunicarte con nuestro estudio. Recibimos la información que compartiste y quedó disponible para su revisión profesional.';
  const summaryText = typeof summary === 'string' ? summary.trim() : '';
  const validDocuments = Array.isArray(documents)
    ? documents.filter(value => typeof value === 'string' && value.trim()) : [];
  const summarySection = administrativeOnly || !summaryText ? '' : `
<tr><td class="email-gutter" style="padding:17px 32px 8px">
<h2 style="font-size:18px;color:${NAVY};margin:0 0 12px">Resumen de tu consulta</h2>
<p style="font-size:15px;line-height:1.75;margin:0;color:${DARK}">${paragraph(summaryText)}</p>
</td></tr>`;
  const documentSection = administrativeOnly || !validDocuments.length ? '' : `
<tr><td class="email-gutter" style="padding:20px 32px 8px">
<h2 style="font-size:18px;color:${NAVY};margin:0 0 12px">Documentación que podés tener a mano</h2>
${documentList(validDocuments)}
</td></tr>`;
  const urgentSection = urgent ? `
    <tr><td style="padding:0 32px 20px">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-left:4px solid ${GOLD};background:#FFF9ED;border-radius:5px">
        <tr><td style="padding:14px 16px;color:${DARK};font-size:14px;line-height:1.6"><strong>Atención prioritaria:</strong> registramos una posible urgencia en tu consulta. Si hay un vencimiento o empeora la situación, contactá al estudio por los canales habituales sin esperar este correo.</td></tr>
      </table>
    </td></tr>` : '';
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Recibimos tu consulta</title>
<style>@media only screen and (max-width:600px){.email-container{width:100%!important}.email-gutter{padding-left:20px!important;padding-right:20px!important}.email-heading{font-size:25px!important}}</style>
</head><body style="margin:0;padding:0;background:#F3F6FB;font-family:Arial,Helvetica,sans-serif;color:${DARK};-webkit-text-size-adjust:100%">
<div style="display:none;font-size:1px;color:#F3F6FB;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">Recibimos tu consulta. Un profesional del estudio revisará la información.</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#F3F6FB"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="email-container" style="width:600px;max-width:100%;background:#FFFFFF;border:1px solid #DAE4F0;border-radius:14px;overflow:hidden">
<tr><td style="background:${NAVY};padding:25px 32px" class="email-gutter">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td valign="middle" width="58"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td align="center" valign="middle" style="width:48px;height:48px;border:1px solid #8EA9CE;border-radius:10px;color:#FFFFFF;font-family:Georgia,serif;font-weight:bold;font-size:23px;letter-spacing:-1px">LC</td></tr></table></td>
<td valign="middle" style="padding-left:13px;color:#FFFFFF;font-size:16px;line-height:1.5;font-weight:700">${safeStudy}<div style="color:#CFDBEC;font-weight:400;font-size:12px;letter-spacing:1px;text-transform:uppercase">Atención jurídica personalizada</div></td>
</tr></table></td></tr>
<tr><td style="height:4px;background:${GOLD};font-size:1px;line-height:4px">&nbsp;</td></tr>
<tr><td class="email-gutter" style="padding:34px 32px 12px">
<div style="color:${BLUE};font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;margin-bottom:10px">Confirmación de recepción</div>
<h1 class="email-heading" style="margin:0 0 18px;font-size:29px;line-height:1.2;color:${NAVY};font-weight:700">Recibimos tu consulta</h1>
<p style="margin:0 0 14px;font-size:16px;line-height:1.6">Hola${safeName ? ` ${safeName}` : ''},</p>
<p style="margin:0 0 22px;font-size:15px;line-height:1.75">${intro}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EDF4FC;border:1px solid #D8E7F9;border-radius:9px"><tr><td style="padding:14px 17px">
<div style="color:${MUTED};font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.7px">Consulta recibida</div>
<div style="color:${NAVY};font-size:15px;font-weight:700;padding-top:5px">${safeArea}</div>
</td></tr></table>
</td></tr>
${summarySection}
${documentSection}
${urgentSection}
<tr><td class="email-gutter" style="padding:22px 32px 30px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #E1E9F2"><tr><td style="padding-top:20px;color:${DARK};font-size:14px;line-height:1.75">
Un profesional del estudio se pondrá en contacto con vos${contact}. Conservá cualquier notificación o documento relacionado con tu caso.<br><br>
Saludos,<br><strong style="color:${NAVY}">${safeStudy}</strong>
</td></tr></table></td></tr>
<tr><td class="email-gutter" style="background:#F7F9FC;border-top:1px solid #E1E9F2;padding:20px 32px;color:${MUTED};font-size:12px;line-height:1.65">
Este mensaje confirma la recepción de tu consulta. No constituye un dictamen jurídico, aceptación del caso ni garantía de resultado. Nunca envíes contraseñas, códigos de seguridad o credenciales bancarias por email.
</td></tr>
</table></td></tr></table></body></html>`;
}

export function buildClientEmailText({ studyName, fullName, area, summary, documents = [], preferredContact, urgent = false, administrativeOnly = false }) {
  const validSummary = typeof summary === 'string' ? summary.trim() : '';
  const validDocuments = Array.isArray(documents)
    ? documents.filter(item => typeof item === 'string' && item.trim()) : [];
  const lines = [studyName, '', 'Recibimos tu consulta', `Hola${fullName ? ` ${fullName}` : ''},`,
    administrativeOnly
      ? 'Recibimos la consulta que enviaste mediante nuestro formulario de contacto. Un profesional del estudio revisará la información que compartiste.'
      : 'Tu consulta quedó registrada para revisión profesional.',
    `Área preliminar: ${area || 'Consulta jurídica'}`];
  if (!administrativeOnly && validSummary) lines.push('', 'Resumen de tu consulta:', validSummary);
  if (!administrativeOnly && validDocuments.length) lines.push('', 'Documentación:',
    validDocuments.map(item => `- ${item}`).join('\n'));
  lines.push('', urgent ? 'Atención prioritaria: ante vencimientos o agravamiento, contactá al estudio por los canales habituales.' : '',
    `Un profesional se pondrá en contacto con vos${preferredContact ? ` por ${preferredContact}` : ''}.`,
    '', 'Este mensaje confirma recepción; no constituye dictamen jurídico ni aceptación del caso.');
  return lines.filter((line, index, all) => line !== '' || all[index - 1] !== '').join('\n');
}
