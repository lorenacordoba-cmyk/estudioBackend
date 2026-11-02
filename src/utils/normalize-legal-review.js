import { normalizeLegalArea, fallbackLegalArea } from './legal-area-normalizer.js';
const txt = value => typeof value === 'string' ? value.trim() : '';
const list = value => Array.isArray(value) ? value.filter(v => typeof v === 'string').map(v => v.trim().slice(0, 800)).filter(Boolean).slice(0, 25) : [];

/** Conserva por separado los campos válidos: los faltantes quedan vacíos.
 * Un resumen omitido nunca debe borrar documentos ni el otro resumen. */
export function normalizeLegalReviewResponse(response, triage = {}) {
  let raw;
  try { raw = JSON.parse(response?.choices?.[0]?.message?.content); } catch { return response; }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return response;
  const data = {
    legalArea: normalizeLegalArea(raw.legalArea, triage.legalArea) || fallbackLegalArea(triage.legalArea),
    suggestedLegalDocumentTitle: txt(raw.suggestedLegalDocumentTitle) || 'EVALUACIÓN PROFESIONAL PENDIENTE — DEFINIR VÍA PROCESAL',
    professionalCaseSummary: txt(raw.professionalCaseSummary).slice(0, 4500),
    clientCaseSummary: txt(raw.clientCaseSummary).slice(0, 3500),
    questionsForClient: list(raw.questionsForClient),
    documentsToRequest: list(raw.documentsToRequest),
    legalFramework: [], // Sin búsqueda web, las fuentes deben verificarse manualmente.
    deadlinesToVerify: list(raw.deadlinesToVerify),
    preliminaryStrategy: list(raw.preliminaryStrategy)
  };
  return { ...response, choices: response.choices.map((choice, index) => index === 0
    ? { ...choice, message: { ...choice.message, content: JSON.stringify(data) } }
    : choice) };
}
