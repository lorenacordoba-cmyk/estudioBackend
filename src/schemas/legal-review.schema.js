export const legalReviewJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    legalArea: {
      type: 'string',
      enum: ['HEALTH', 'PREVISIONAL', 'CONSUMER', 'DAMAGES', 'TAX', 'MULTI_AREA', 'OTHER', 'UNKNOWN']
    },
    suggestedLegalDocumentTitle: { type: 'string' },
    professionalCaseSummary: { type: 'string' },
    clientCaseSummary: { type: 'string' },
    questionsForClient: {
      type: 'array',
      items: { type: 'string' }
    },
    documentsToRequest: {
      type: 'array',
      items: { type: 'string' }
    },
    legalFramework: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          normName: { type: 'string' },
          article: { type: 'string' },
          relevance: { type: 'string' },
          officialUrl: { type: 'string' }
        },
        required: ['normName', 'article', 'relevance', 'officialUrl']
      }
    },
    deadlinesToVerify: {
      type: 'array',
      items: { type: 'string' }
    },
    preliminaryStrategy: {
      type: 'array',
      items: { type: 'string' }
    }
  },
  required: [
    'legalArea',
    'suggestedLegalDocumentTitle',
    'professionalCaseSummary',
    'clientCaseSummary',
    'questionsForClient',
    'documentsToRequest',
    'legalFramework',
    'deadlinesToVerify',
    'preliminaryStrategy'
  ]
};
