import { groq } from '../config/groq.js';
import { env } from '../config/env.js';
import { observability } from './observability.service.js';
import { legalReviewJsonSchema } from '../schemas/legal-review.schema.js';
import { buildLawyerSpecialistCommonPrompt, buildLawyerSpecialistSkillPrompt } from '../prompts/lawyer-specialist.prompt.js';
import { usageService } from './usage.service.js';
import { createGroqMessages } from './prompt-cache.js';
import { createStructuredCompletion } from './structured-completion.js';
import { normalizeLegalReviewResponse } from '../utils/normalize-legal-review.js';
import { buildFormReviewContext } from '../utils/form-review-context.js';

export const OFFICIAL_ARGENTINA_DOMAINS = [
  'argentina.gob.ar',
  'boletinoficial.gob.ar',
  'servicios.infoleg.gob.ar',
  'saij.gob.ar',
  'csjn.gov.ar',
  'cij.gov.ar',
  'pjn.gov.ar',
  'mpf.gob.ar',
  'anses.gob.ar',
  'arca.gob.ar',
  'afip.gob.ar',
  'sssalud.gob.ar',
  'gba.gob.ar',
  'scba.gov.ar',
  'arba.gob.ar',
  'agip.gob.ar',
  'buenosaires.gob.ar',
  'jusbaires.gob.ar'
];

export function isOfficialArgentineUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    return host === 'gob.ar' || host.endsWith('.gob.ar') || host === 'gov.ar' || host.endsWith('.gov.ar');
  } catch {
    return false;
  }
}

function sanitizeOfficialSources(review) {
  const clean = structuredClone(review);
  clean.legalFramework = (clean.legalFramework || []).filter(item => isOfficialArgentineUrl(item.officialUrl));
  return clean;
}

export function reviewInput({ session, triage, maxChars = 7000 }) {
  // Primero usar la transcripción íntegra, siempre que quepa en un pedido
  // razonable. Para casos largos, conservar ficha + memoria y turnos recientes.
  // La consulta original sigue en el correo inicial enviado al estudio.
  const packet = {
    triage,
    caseMemory: session.caseMemory || null,
    transcript: session.transcript || [],
    omittedOlderMessages: 0,
    clientContext: session.lastClientContext || null,
    reference: session.sessionId.slice(0, 8).toUpperCase()
  };
  let body = JSON.stringify(packet);
  while (body.length > maxChars && packet.transcript.length > 6) {
    packet.transcript = packet.transcript.slice(2);
    packet.omittedOlderMessages += 2;
    body = JSON.stringify(packet);
  }
  return JSON.stringify(packet);
}

export class LegalSpecialistService {
  /** Evaluación jurídica de consultas enviadas mediante el formulario, sin entrevista conversacional. */
  async reviewForm({ submission }) {
    return this.review(buildFormReviewContext(submission));
  }

  async review({ session, triage }) {
    await usageService.assertWithinDailyLimits();

    // Groq JSON estricto no se combina con búsqueda web en este flujo.
    // En consecuencia no afirmamos haber verificado leyes en sitios oficiales.
    const aiStart = performance.now();
    let response;
    try {
    response = await createStructuredCompletion({
      // JSON común, con validación y normalización local. El JSON estricto de
      // Groq rechazaba informes útiles por una omisión auxiliar.
      client: groq, schema: legalReviewJsonSchema, mode: 'json_object',
      normalizeResponse: result => normalizeLegalReviewResponse(result, triage),
      onFallback: () => usageService.assertWithinDailyLimits(),
      request: {
      model: env.GROQ_LEGAL_REVIEW_MODEL,
      reasoning_effort: env.GROQ_LEGAL_REVIEW_REASONING_EFFORT,
      max_completion_tokens: env.GROQ_LEGAL_REVIEW_MAX_COMPLETION_TOKENS,
      messages: createGroqMessages({
        stablePrompts: [
          buildLawyerSpecialistCommonPrompt({ studyName: env.STUDY_NAME }),
          buildLawyerSpecialistSkillPrompt({ legalArea: triage.legalArea })
        ],
        dynamicInput: `Analizá este expediente preliminar de admisión. No agregues hechos no presentes. Sin navegación verificable, legalFramework debe ser [].\n\n${reviewInput({ session, triage })}`
      }),
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'legal_specialist_review', strict: true, schema: legalReviewJsonSchema }
      }
      }
    });
    } catch (error) {
      observability.increment('groq_specialist_errors');
      throw error;
    } finally {
      observability.observe('groq_specialist_ms', performance.now() - aiStart);
    }
    await usageService.record({ sessionId: session.sessionId, response, model: env.GROQ_LEGAL_REVIEW_MODEL });
    const output = response?.choices?.[0]?.message?.content;
    if (!output) throw new Error('Groq no devolvió el informe del especialista.');

    try {
      const parsed = JSON.parse(output);
      return sanitizeOfficialSources({ ...parsed, legalFramework: [] });
    } catch (error) {
      throw new Error(`No se pudo interpretar el informe del abogado especialista: ${error.message}`);
    }
  }

  fallback({ triage }) {
    return {
      legalArea: triage.legalArea,
      suggestedLegalDocumentTitle: 'EVALUACIÓN PROFESIONAL PENDIENTE — DEFINIR VÍA PROCESAL',
      // Sin respuesta del especialista, no inventar un resumen profesional.
      professionalCaseSummary: '', 
      // Sin un especialista exitoso NO se fabrica un resumen para el cliente.
      clientCaseSummary: '',
      questionsForClient: triage.questionsToAsk || [],
      // Si falla Groq, no atribuir al especialista documentos inferidos por triage.
      documentsToRequest: [],
      legalFramework: [],
      deadlinesToVerify: [],
      preliminaryStrategy: ['Realizar revisión profesional manual de los antecedentes y verificar normativa exclusivamente en fuentes oficiales argentinas.']
    };
  }
}

export const legalSpecialistService = new LegalSpecialistService();
