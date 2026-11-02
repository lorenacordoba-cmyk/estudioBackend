/**
 * Adaptador de consultas del formulario para ejecutar el informe del especialista.
 * La selección de la especialidad proviene del select del usuario, no de una
 * clasificación jurídica inventada por Node. No transmitir datos de contacto
 * al modelo: esos datos son exclusivos de la notificación SMTP.
 */
export const FORM_LEGAL_AREAS = Object.freeze({
  'Derecho a la salud': 'HEALTH',
  'Derecho del consumidor': 'CONSUMER',
  'Daños y perjuicios': 'DAMAGES',
  'Derecho previsional': 'PREVISIONAL',
  'Derecho tributario': 'TAX',
  'Otra consulta': 'UNKNOWN'
});

export function buildFormReviewContext(submission) {
  const legalArea = FORM_LEGAL_AREAS[submission.consultationType] || 'UNKNOWN';
  return {
    session: {
      sessionId: submission.id,
      transcript: [{
        role: 'user',
        createdAt: submission.receivedAt,
        text: [
          'Consulta recibida mediante formulario web; no se realizó entrevista previa.',
          `Rama seleccionada por el cliente: ${submission.consultationType}`,
          `Motivo: ${submission.consultationReason}`,
          `Residencia declarada: ${submission.location}`,
          `Relato del cliente: ${submission.caseDescription}`
        ].join('\n')
      }]
    },
    triage: {
      legalArea,
      intakeChannel: 'WEB_FORM',
      // No inferir urgencia ni completar datos que el formulario no preguntó.
      urgency: 'UNKNOWN'
    }
  };
}
