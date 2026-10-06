export const DEFAULT_OPENAI_MODEL = 'gpt-6-luna';
export const OPENAI_TRANSLATION_MODELS = [
  { id: 'gpt-6-luna', label: 'GPT-6 Luna (Lua) — Econômico' },
  { id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol — Equilíbrio' },
  { id: 'gpt-6-astra', label: 'GPT-6 Astra — Maior capacidade' },
];

export function openAITranslationParameters(model) {
  return /^gpt-6(?:\.|-)/.test(model)
    ? { reasoning_effort: 'low' }
    : { temperature: 0.3 };
}
