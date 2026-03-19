/**
 * @file app/api/chat/route.ts
 * @description InsightStream AI backend — multi-model support.
 * Reads modelId from request body to select Groq or Mistral provider.
 */

import { createGroq } from "@ai-sdk/groq";
import { createMistral } from "@ai-sdk/mistral";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { streamText, tool, type CoreMessage, type LanguageModelV1 } from "ai";
import { z } from "zod";
import {
  fetchEurostatData,
  INDICATORS,
  COUNTRY_LABELS,
  type EuroRecord,
  type EurostatResult,
} from "@/app/utils/eurostat-client";
import { MODELS, DEFAULT_MODEL, type ModelId } from "@/app/utils/models";

// ─── Runtime ──────────────────────────────────────────────────────────────────

export const maxDuration = 30;

// ─── Providers ────────────────────────────────────────────────────────────────

const groq    = createGroq({ apiKey: process.env.GROQ_API_KEY    ?? "" });
const mistral = createMistral({ apiKey: process.env.MISTRAL_API_KEY ?? "" });
const google  = createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? "" });

function resolveModel(modelId: ModelId): LanguageModelV1 {
  const config = MODELS[modelId] ?? MODELS[DEFAULT_MODEL];
  if (modelId.startsWith("groq/"))    return groq(config.modelId);
  if (modelId.startsWith("mistral/")) return mistral(config.modelId);
  if (modelId.startsWith("google/"))  return google(config.modelId);
  return groq(MODELS[DEFAULT_MODEL].modelId);
}

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `
You are a Senior Economic Analyst embedded in InsightStream — a professional
dashboard for real-time European economic intelligence powered by Eurostat data.

AVAILABLE TOOL:
\`getEurostatData\` — fetches live data from Eurostat for EU countries.

Indicators available:
- inflation: HICP annual % change (monthly)
- unemployment: % of active population (monthly)
- energy_prices: household electricity €/kWh (semi-annual)
- gdp_growth: real GDP % change vs previous quarter (quarterly)
- consumer_confidence: consumer sentiment balance index (monthly)
- house_prices: residential property price index 2015=100 (quarterly)
- neet_youth: % youth 15-29 unemployment rate — monthly, proxy for youth labour market
- renewables: % renewable energy share of gross final consumption (annual)
- public_debt: general government consolidated debt % of GDP (annual)
- industrial_production: manufacturing output index 2021=100, seasonally adjusted (monthly) — NOTE: use individual country codes only (IT, DE, FR, ES), NOT EU27_2020 or EA20 (no EU aggregate available)


IMPORTANT — periods parameter: ALWAYS in MONTHS. Convert user requests:
- "8 quarters" → periods=24, "4 years" → periods=48, "10 years" → periods=120
- "last 2 years" → periods=24 (default), "last 5 years" → periods=60

RULES:
1. ALWAYS call getEurostatData before commenting on any indicator. Never invent figures.
2. You CAN call the tool multiple times in sequence for multi-indicator questions.
3. After tool results, respond in Italian with:
   - **Dato**: exact figures from the tool
   - **Contesto**: one-sentence interpretation
   - **Tendenza**: positive / negative / stable
4. If no data is returned: "Dato non disponibile per il periodo richiesto."
5. If the user asks for an indicator NOT in the list above (e.g. investments, exports, wages),
   do NOT call the tool with an invalid indicator. Instead respond:
   "Questo indicatore non è disponibile in InsightStream. Gli indicatori supportati sono: inflazione, disoccupazione, prezzi energia, crescita PIL, fiducia consumatori, prezzi immobili, NEET giovani, rinnovabili, debito pubblico, produzione industriale."
   Then suggest the closest available indicator.
5. Be direct and professional. No filler phrases.

CONTEXTUAL SUGGESTIONS (mandatory — every single response, no exceptions):
You MUST end EVERY response with this EXACT block, even after chip-triggered queries, even after follow-ups:
Generate 3 relevant follow-up suggestions based on what was just analyzed.

CRITICAL RULES for suggestions:
- "prompt" must ONLY reference indicators from this exact list:
  inflation | unemployment | energy_prices | gdp_growth | consumer_confidence |
  house_prices | neet_youth | renewables | public_debt
- NEVER suggest indicators outside this list (no "investimenti", "esportazioni", "salari", etc.)
- For "Indicatore correlato", pick a thematically related indicator FROM THE LIST ABOVE
  Examples: inflation → consumer_confidence | unemployment → neet_youth | gdp_growth → public_debt
- "label" must be short (max 4 words)
- "prompt" must be a complete Italian sentence the user can submit directly

\`\`\`suggestions
{"suggestions":[{"label":"Confronta con [PAESE]","prompt":"Confronta [NOME_ITALIANO_INDICATORE] di [PAESI_ATTUALI] e [NUOVO_PAESE] negli ultimi 24 mesi"},{"label":"[NOME_INDICATORE_CORRELATO]","prompt":"Mostrami [NOME_ITALIANO_INDICATORE_CORRELATO] per [PAESI_ATTUALI]"},{"label":"Serie storica 48 mesi","prompt":"Mostrami [NOME_ITALIANO_INDICATORE] degli ultimi 48 mesi per [PAESI_ATTUALI]"}]}
\`\`\`

Replace ALL placeholders with actual values.
IMPORTANT: In "prompt" fields, ALWAYS use natural Italian descriptions (e.g. "prezzi degli immobili", "inflazione", "disoccupazione") — NEVER use technical codes like "house_prices", "gdp_growth", "neet_youth".
NEVER suggest non-existing indicators. NEVER skip this block. This block is REQUIRED in 100% of responses.
`.trim();

// EurostatResult is defined and exported from @/app/utils/eurostat-client

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request): Promise<Response> {
  let messages: CoreMessage[];
  let modelId: ModelId = DEFAULT_MODEL;

  try {
    const body = await req.json();
    messages = body.messages;
    if (body.modelId && body.modelId in MODELS) {
      modelId = body.modelId as ModelId;
    }
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const getEurostatData = tool({
    description:
      "Fetches live economic data from Eurostat for one or more EU countries. " +
      "Always call this before discussing any economic indicator.",
    parameters: z.object({
      indicator: z
        .enum([
          "inflation", "unemployment", "energy_prices", "gdp_growth",
          "consumer_confidence", "house_prices", "neet_youth",
          "renewables", "public_debt", "industrial_production",
        ])
        .describe("Economic indicator to fetch."),
      countries: z
        .array(z.string().min(2).max(12))
        .min(1)
        .max(6)
        .describe(
          "ISO codes: 'IT', 'DE', 'FR', 'ES', 'EU27_2020' (EU avg), 'EA20' (Eurozone). Max 6."
        ),
      periods: z
        .number().int().min(3).max(240).optional()
        .describe(
          "Number of MONTHS to fetch (always in months). " +
          "OMIT unless user explicitly specifies a period. " +
          "Each indicator has its own optimal default (house prices=10yr, renewables=20yr). " +
          "Only pass if user says: 'last X months/years', 'X quarters', 'since YEAR'. " +
          "Conversion: 8 quarters=24, 5 years=60, 10 years=120."
        ),
    }),
    execute: async ({ indicator, countries, periods }): Promise<EurostatResult> => {
      const config = INDICATORS[indicator];
      // Use indicator's defaultPeriods when user didn't specify
      const resolvedPeriods = periods ?? config.defaultPeriods ?? 24;
      try {
        const result = await fetchEurostatData({ indicator, countries, lastPeriods: resolvedPeriods });
        return {
          indicator,
          indicatorLabel: config.label,
          unit:           config.unit,
          countries,
          records:        result.records,
          fetchedAt:      result.fetchedAt,
          fromCache:      result.fromCache,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[EurostatTool] Failed to fetch ${indicator}:`, msg);
        // Return empty result — AI will report "dato non disponibile"
        return {
          indicator,
          indicatorLabel: config.label,
          unit:           config.unit,
          countries,
          records:        [],
          fetchedAt:      new Date().toISOString(),
          fromCache:      false,
        };
      }
    },
  });

  try {
    const result = streamText({
      model: resolveModel(modelId),
      system: SYSTEM_PROMPT,
      messages,
      temperature: 0.1,
      tools: { getEurostatData },
      maxSteps: 5,
    });

    return result.toDataStreamResponse({
      getErrorMessage: (error: unknown) => {
        const msg = error instanceof Error ? error.message : String(error);
        console.error("[InsightStream] Stream error:", msg);
        return "Errore durante l'elaborazione della risposta AI.";
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[InsightStream] Route error:", msg);

    const isRateLimit = msg.includes("quota") || msg.includes("rate") ||
                        msg.includes("429") || msg.includes("limit") ||
                        msg.includes("capacity") || msg.includes("overloaded");

    return new Response(
      JSON.stringify({
        error: isRateLimit
          ? "Rate limit raggiunto. Cambia modello AI dall'InfoPanel (icona ⓘ) o riprova tra qualche secondo."
          : "Errore interno del server.",
        detail: msg,
        timestamp: new Date().toISOString(),
      }),
      {
        status: isRateLimit ? 503 : 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

// ─── GET: health-check ────────────────────────────────────────────────────────

export async function GET(): Promise<Response> {
  return new Response(
    JSON.stringify({
      status:     "ok",
      models:     Object.keys(MODELS),
      indicators: Object.keys(INDICATORS),
      countries:  Object.keys(COUNTRY_LABELS),
      timestamp:  new Date().toISOString(),
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
