/**
 * Groq: preferimos el esquema estricto, pero algunos rechazos HTTP 400
 * corresponden al formato/decodificador y no al contenido de la consulta.
 * La recuperación se realiza como máximo UNA vez y valida el JSON localmente.
 */
function schemaMatches(data, schema, path = '$') {
  if (!schema || typeof schema !== 'object') return null;
  if (schema.enum && !schema.enum.some(x => x === data)) return `${path}: enum inválido`;
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  const actual = data === null ? 'null' : Array.isArray(data) ? 'array' : typeof data;
  if (!types.includes(actual)) return `${path}: tipo inválido (${actual})`;
  if (actual === 'object') {
    const properties = schema.properties || {};
    for (const key of schema.required || []) {
      if (!Object.hasOwn(data, key)) return `${path}.${key}: requerido`;
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(data)) {
        if (!Object.hasOwn(properties, key)) return `${path}.${key}: clave inesperada`;
      }
    }
    for (const [key, value] of Object.entries(data)) {
      if (Object.hasOwn(properties, key)) {
        const issue = schemaMatches(value, properties[key], `${path}.${key}`);
        if (issue) return issue;
      }
    }
  }
  if (actual === 'array') {
    for (let i = 0; i < data.length; i += 1) {
      const issue = schemaMatches(data[i], schema.items, `${path}[${i}]`);
      if (issue) return issue;
    }
  }
  return null;
}

export function validateStructuredContent(response, schema) {
  const content = response?.choices?.[0]?.message?.content;
  let parsed;
  try { parsed = JSON.parse(content); }
  catch { parsed = null; }
  const issue = schemaMatches(parsed, schema);
  if (issue) {
    // No se registra el contenido ni su valor, solo la ruta del error.
    const error = new Error('Groq no devolvió un JSON válido según el contrato interno.');
    error.code = 'GROQ_INVALID_STRUCTURED_OUTPUT';
    error.status = 502;
    error.validationPath = issue.split(':')[0];
    throw error;
  }
  return parsed;
}

export function buildJsonObjectRequest(request, schema) {
  const fields = Object.keys(schema?.properties || {});
  const instruction = `Respondé SOLO JSON válido sin Markdown; respetá el contrato interno (additionalProperties: false). Incluí estas propiedades de primer nivel, todas obligatorias: ${fields.join(', ')}. No envíes otras propiedades ni agregues hechos inventados.`;
  return {
    ...request,
    messages: [
      ...request.messages.slice(0, -1),
      { role: 'system', content: instruction },
      request.messages.at(-1)
    ],
    response_format: { type: 'json_object' }
  };
}

/** mode: 'auto' (estricto y recuperación por fallo de esquema), 'strict', 'json_object'. */
export async function createStructuredCompletion({ client, request, schema, mode = 'auto', onFallback, normalizeResponse }) {
  if (!['auto', 'strict', 'json_object'].includes(mode)) throw new Error('GROQ_OUTPUT_MODE inválido.');
  const perform = payload => client.chat.completions.create(payload);
  const verify = response => {
    const normalized = normalizeResponse ? normalizeResponse(response) : response;
    validateStructuredContent(normalized, schema);
    return normalized;
  };
  if (mode === 'json_object') {
    const response = await perform(buildJsonObjectRequest(request, schema));
    return verify(response);
  }
  try {
    const response = await perform(request);
    return verify(response);
  } catch (error) {
    // No convertir otros errores de Groq, como auth, rate-limit o modelo inválido.
    if (mode !== 'auto' || error?.upstreamStatus !== 400 || error?.upstreamIssue !== 'schema') throw error;
    await onFallback?.();
    const response = await perform(buildJsonObjectRequest(request, schema));
    return verify(response);
  }
}
