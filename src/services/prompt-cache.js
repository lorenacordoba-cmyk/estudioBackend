/**
 * Groq no admite `prompt_cache_key` ni breakpoints explícitos de OpenAI.
 * En modelos soportados (por ejemplo openai/gpt-oss-20b) Groq cachea
 * automáticamente prefijos idénticos. Primero instrucciones comunes,
 * después skill específica y por último el contexto privado del usuario.
 */
export function createGroqMessages({ stablePrompts, dynamicInput }) {
  if (!Array.isArray(stablePrompts) || !stablePrompts.length || stablePrompts.some(p => typeof p !== 'string' || !p.trim())) {
    throw new Error('Se requiere al menos un prompt estable.');
  }
  return [
    { role: 'system', content: stablePrompts.join('\n\n') },
    { role: 'user', content: dynamicInput }
  ];
}
