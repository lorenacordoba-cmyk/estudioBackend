/**
 * Valores canónicos utilizados por el especialista para clasificar su informe.
 * Groq puede responder con nombres de ramas en español. Normalizamos solo
 * equivalencias inequívocas y nunca convertimos datos arbitrarios en una
 * especialidad jurídica determinada.
 */
const CANONICAL = new Set(['HEALTH', 'PREVISIONAL', 'CONSUMER', 'DAMAGES', 'TAX', 'MULTI_AREA', 'OTHER', 'UNKNOWN']);

const aliases = {
  HEALTH: [
    'SALUD', 'DERECHO A LA SALUD', 'DERECHO DE SALUD', 'DERECHO SANITARIO',
    'AMPARO DE SALUD', 'DERECHO DE LA SALUD', 'COBERTURA MEDICA', 'MEDICINA PREPAGA', 'OBRA SOCIAL'
  ],
  PREVISIONAL: [
    'PREVISION', 'DERECHO PREVISIONAL', 'JUBILACION', 'JUBILACIONES',
    'PENSION', 'PENSIONES', 'SEGURIDAD SOCIAL'
  ],
  CONSUMER: [
    'CONSUMIDOR', 'CONSUMO', 'DERECHO DEL CONSUMIDOR',
    'DEFENSA DEL CONSUMIDOR', 'RELACIONES DE CONSUMO', 'RELACION DE CONSUMO'
  ],
  DAMAGES: [
    'DANOS', 'DANOS Y PERJUICIOS', 'RESPONSABILIDAD CIVIL',
    'INDEMNIZACION', 'ACCIDENTES', 'ACCIDENTE DE TRANSITO'
  ],
  TAX: ['TRIBUTARIO', 'TRIBUTARIA', 'DERECHO TRIBUTARIO', 'FISCAL', 'IMPUESTOS'],
  MULTI_AREA: ['MULTIAREA', 'MULTI AREA', 'MULTIPLE', 'MULTIPLES AREAS', 'VARIAS AREAS', 'MULTIDISCIPLINARIO'],
  OTHER: [
    'OTRO', 'OTROS', 'OTRA', 'OTRAS', 'OTRA AREA', 'OTRO DERECHO',
    'LABORAL', 'DERECHO LABORAL', 'LABOR', 'EMPLOYMENT', 'PENAL', 'DERECHO PENAL', 'CRIMINAL',
    'FAMILIA', 'DERECHO DE FAMILIA', 'FAMILY', 'SUCESIONES', 'MIGRATORIO', 'IMMIGRATION', 'CIVIL'
  ],
  UNKNOWN: [
    'DESCONOCIDO', 'SIN CLASIFICAR', 'NO CLASIFICADO', 'SIN DETERMINAR',
    'NO DETERMINADO', 'UNDETERMINED', 'PENDIENTE', 'POR DEFINIR', 'NO IDENTIFICADO',
    'NINGUNA', 'NULO', 'NULL', 'N A', ''
  ]
};

function key(value) {
  return value
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

const dictionary = new Map();
for (const canonical of CANONICAL) dictionary.set(key(canonical), canonical);
for (const [canonical, values] of Object.entries(aliases)) {
  for (const value of values) dictionary.set(key(value), canonical);
}

/**
 * Devuelve null si el tipo es inválido: no se aceptan objetos, números ni
 * arrays en un campo de clasificación. Si viene una etiqueta no reconocida,
 * se conserva el área previamente validada, o UNKNOWN en la primera consulta.
 * Esto evita un 502 por variantes de vocabulario sin inventar una especialidad.
 */
export function fallbackLegalArea(previousArea = 'UNKNOWN') {
  return CANONICAL.has(previousArea) ? previousArea : 'UNKNOWN';
}

export function normalizeLegalArea(value, previousArea = 'UNKNOWN') {
  if (typeof value !== 'string') return null;
  const label = dictionary.get(key(value));
  if (label) return label;
  return fallbackLegalArea(previousArea);
}
