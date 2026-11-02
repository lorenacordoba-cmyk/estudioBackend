import nodemailer from 'nodemailer';
import { z } from 'zod';
import { env } from '../config/env.js';
import { escapeHtml } from '../utils/html.js';
import { buildClientEmailHtml, buildClientEmailText } from '../utils/client-email-template.js';

const emailSchema = z.string().trim().email();

let transporter;
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS }
    });
  }
  return transporter;
}

function validEmail(value) {
  return emailSchema.safeParse(String(value || '')).success;
}

function listHtml(items, emptyText = 'Sin datos adicionales registrados.') {
  const values = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!values.length) return `<p style="color:#667085">${escapeHtml(emptyText)}</p>`;
  return `<ul style="padding-left:20px">${values.map(item => `<li style="margin:5px 0">${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function questionListHtml(items = []) {
  const values = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!values.length) return '<p style="color:#667085">No quedaron preguntas adicionales identificadas.</p>';
  return `<ol style="padding-left:22px">${values.map(item => `<li style="margin:8px 0">${escapeHtml(String(item))}</li>`).join('')}</ol>`;
}

function documentListHtml(items = []) {
  const values = Array.isArray(items) ? items.filter(value => typeof value === 'string' && value.trim()) : [];
  if (!values.length) return '';
  return `<ul style="padding-left:20px">${values.map(item => `<li style="margin:7px 0">${escapeHtml(String(item))}</li>`).join('')}</ul>`;
}

function legalFrameworkHtml(items = []) {
  if (!items.length) return '<p style="color:#667085">No se incorporó normativa automática con fuente oficial verificable. Revisar manualmente.</p>';
  return items.map(item => `
    <div style="border-left:4px solid #123E78;padding:10px 12px;margin:10px 0;background:#f8fafc">
      <div><strong>${escapeHtml(item.normName)}</strong>${item.article ? ` — ${escapeHtml(item.article)}` : ''}</div>
      <div style="margin-top:5px">${escapeHtml(item.relevance)}</div>
      <div style="margin-top:6px"><a href="${escapeHtml(item.officialUrl)}" style="color:#0B4D9B">Fuente oficial argentina</a></div>
    </div>`).join('');
}

function sectionTitle(text) {
  return `<h2 style="font-size:18px;color:#0B2D5C;border-bottom:1px solid #e5e7eb;padding-bottom:6px;margin-top:24px">${escapeHtml(text)}</h2>`;
}

export class NotificationService {
  /** Segundo correo al estudio: informe del especialista posterior al formulario. */
  async sendStudyContactReviewEmail({ submission, legalReview }) {
    const reference = submission.id.slice(0, 8).toUpperCase();
    const review = legalReview || {};
    const summary = typeof review.professionalCaseSummary === 'string' ? review.professionalCaseSummary.trim() : '';
    const documents = Array.isArray(review.documentsToRequest)
      ? review.documentsToRequest.filter(value => typeof value === 'string' && value.trim()) : [];
    const title = review.suggestedLegalDocumentTitle || 'EVALUACIÓN PROFESIONAL — REVISAR ANTECEDENTES';
    const subject = `[EVALUACIÓN] Consulta web - ${submission.fullName} [${reference}]`.replace(/[\r\n]/g, ' ');
    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.55;color:#172033;max-width:820px;margin:auto">
        <div style="background:#0B2D5C;color:#fff;padding:20px 22px">
          <div>EVALUACIÓN PRELIMINAR — ${escapeHtml(env.STUDY_NAME)}</div>
          <h1 style="font-size:21px;color:#fff">${escapeHtml(title)}</h1>
        </div>
        <p><strong>Referencia:</strong> ${escapeHtml(reference)}</p>
        <p><strong>Cliente:</strong> ${escapeHtml(submission.fullName)}</p>
        <p><strong>Email:</strong> ${escapeHtml(submission.email)}</p>
        <p><strong>Área elegida en formulario:</strong> ${escapeHtml(submission.consultationType)}</p>
        <p><strong>Motivo:</strong> ${escapeHtml(submission.consultationReason)}</p>
        <p><strong>Descripción original:</strong> ${escapeHtml(submission.caseDescription)}</p>
        ${sectionTitle('Resumen jurídico profesional')}
        ${summary ? `<p>${escapeHtml(summary)}</p>` : '<p>Resumen profesional no disponible. Revisar la descripción original.</p>'}
        ${sectionTitle('Preguntas pendientes para el cliente')}
        ${questionListHtml(review.questionsForClient)}
        ${documents.length ? `${sectionTitle('Documentación sugerida')}${documentListHtml(documents)}` : ''}
        ${sectionTitle('Plazos a verificar')}
        ${listHtml(review.deadlinesToVerify, 'Sin plazos concretos identificados automáticamente.')}
        ${sectionTitle('Estrategia profesional preliminar')}
        ${listHtml(review.preliminaryStrategy, 'Pendiente de revisión profesional.')}
        <p style="font-size:12px;color:#667085">Evaluación automática con los datos proporcionados en el formulario. No hubo entrevista ni verificación de fuentes oficiales. Requiere revisión de una abogada.</p>
      </div>`;
    const info = await getTransporter().sendMail({
      from: env.SMTP_FROM || env.SMTP_USER,
      to: env.STUDY_EMAIL,
      replyTo: validEmail(submission.email) ? submission.email : undefined,
      subject,
      html
    });
    if (Array.isArray(info?.accepted) && info.accepted.length === 0) {
      throw Object.assign(new Error('El SMTP no aceptó el informe del especialista.'), { code: 'SMTP_REVIEW_NOT_ACCEPTED' });
    }
    return info;
  }

  async notifyContact(submission) {
    const reference = submission.id.slice(0, 8).toUpperCase();
    const studySubject = `Nueva consulta web - ${submission.fullName} [${reference}]`;
    const studyHtml = `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#172033">
        <h1>${escapeHtml(studySubject)}</h1>
        <p><strong>Nombre:</strong> ${escapeHtml(submission.fullName)}</p>
        <p><strong>Teléfono:</strong> ${escapeHtml(submission.phone)}</p>
        <p><strong>Email:</strong> ${escapeHtml(submission.email)}</p>
        <p><strong>Residencia:</strong> ${escapeHtml(submission.location)}</p>
        <p><strong>Tipo:</strong> ${escapeHtml(submission.consultationType || '-')}</p>
        <p><strong>Motivo de consulta:</strong> ${escapeHtml(submission.consultationReason || '-')}</p>
        <h2>Descripción</h2><p>${escapeHtml(submission.caseDescription)}</p>
        <p><strong>Solicitud de contacto:</strong> enviada por el cliente mediante el formulario web.</p>
        <p style="font-size:12px;color:#667085">La evaluación del especialista se remitirá por separado, si está disponible; de lo contrario, revisar manualmente esta consulta.</p>
      </div>`;

    // La confirmación al cliente sigue siendo administrativa. La evaluación
    // posterior se remite exclusivamente al estudio en otro correo.
    // Primero enviamos al estudio para no confirmar una recepción inexistente.
    const sendMail = message => getTransporter().sendMail(message);
    try {
      const study = await sendMail({
        from: env.SMTP_FROM || env.SMTP_USER,
        to: env.STUDY_EMAIL,
        replyTo: submission.email,
        subject: studySubject,
        html: studyHtml
      });
      if (Array.isArray(study?.accepted) && study.accepted.length === 0) {
        throw Object.assign(new Error('El SMTP no aceptó al estudio.'), { code: 'SMTP_STUDY_NOT_ACCEPTED' });
      }
    } catch (error) {
      return { studyDelivered: false, clientDelivered: false, errors: [`Estudio: ${error.code || 'SMTP_SEND_FAILED'}`] };
    }

    const emailData = {
      studyName: env.STUDY_NAME,
      fullName: submission.fullName,
      area: submission.consultationType || 'Consulta web',
      administrativeOnly: true,
      preferredContact: 'el medio de contacto que brindaste'
    };
    try {
      const client = await sendMail({
        from: env.SMTP_FROM || env.SMTP_USER,
        to: submission.email,
        replyTo: env.STUDY_EMAIL,
        subject: `Recibimos tu consulta - ${env.STUDY_NAME}`,
        html: buildClientEmailHtml(emailData),
        text: buildClientEmailText(emailData)
      });
      if (Array.isArray(client?.accepted) && client.accepted.length === 0) {
        throw Object.assign(new Error('El SMTP no aceptó al cliente.'), { code: 'SMTP_CLIENT_NOT_ACCEPTED' });
      }
      return { studyDelivered: true, clientDelivered: true, errors: [] };
    } catch (error) {
      return { studyDelivered: true, clientDelivered: false, errors: [`Cliente: ${error.code || 'SMTP_SEND_FAILED'}`] };
    }

  }
}

export const notificationService = new NotificationService();
