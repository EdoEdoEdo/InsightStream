/**
 * @file app/utils/models.ts
 * @description AI model registry — single source of truth for available models.
 * Add new models here; route.ts and InfoPanel pick them up automatically.
 */

export const MODEL_IDS = [
  "groq/llama-3.3-70b",
  "groq/llama-3.1-8b",
  "mistral/mistral-small",
  "google/gemini-2.0-flash-lite",
] as const;

export type ModelId = (typeof MODEL_IDS)[number];

export interface ModelConfig {
  name:        string;
  provider:    string;
  modelId:     string;         // actual API model identifier
  color:       string;
  description: string;
  stats:       string[];
  free:        boolean;
  apiKeyEnv:   string;
}

export const MODELS: Record<ModelId, ModelConfig> = {
  "groq/llama-3.3-70b": {
    name:        "Llama 3.3 70B",
    provider:    "Groq",
    modelId:     "llama-3.3-70b-versatile",
    color:       "#00d4ff",
    description: "Modello principale — alta qualità di analisi, ottimo per ragionamenti complessi e confronti multi-indicatore.",
    stats:       ["70B parametri", "30 req/min", "6K token/min"],
    free:        true,
    apiKeyEnv:   "GROQ_API_KEY",
  },
  "groq/llama-3.1-8b": {
    name:        "Llama 3.1 8B",
    provider:    "Groq",
    modelId:     "llama-3.1-8b-instant",
    color:       "#ff8c42",
    description: "Velocissimo — ideale per query semplici e sessioni intensive. Minore profondità di analisi.",
    stats:       ["8B parametri", "30 req/min", "Ultra veloce"],
    free:        true,
    apiKeyEnv:   "GROQ_API_KEY",
  },
  "mistral/mistral-small": {
    name:        "Mistral Small",
    provider:    "Mistral AI",
    modelId:     "mistral-small-latest",
    color:       "#a78bfa",
    description: "Modello europeo — eccellente per l'analisi di dati EU, ottimo equilibrio qualità/velocità. 1B token/mese gratuiti.",
    stats:       ["Europeo", "1B token/mese free", "128K contesto"],
    free:        true,
    apiKeyEnv:   "MISTRAL_API_KEY",
  },
  "google/gemini-2.0-flash-lite": {
    name:        "Gemini 2.0 Flash-Lite",
    provider:    "Google AI",
    modelId:     "gemini-2.0-flash-lite",
    color:       "#4ade80",
    description: "Il modello Google più veloce ed economico — ottimo per analisi rapide. 15 req/min gratuiti su AI Studio.",
    stats:       ["1M token context", "15 req/min free", "Ultra veloce"],
    free:        true,
    apiKeyEnv:   "GOOGLE_GENERATIVE_AI_API_KEY",
  },
};

export const DEFAULT_MODEL: ModelId = "groq/llama-3.3-70b";
