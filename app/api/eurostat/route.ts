/**
 * @file app/api/eurostat/route.ts
 * @description Server-side proxy for Eurostat API.
 *
 * Why proxy instead of calling Eurostat directly from client?
 *   1. Avoids CORS issues (Eurostat blocks browser requests)
 *   2. Keeps API logic server-side
 *   3. Enables Next.js edge caching (revalidate: 3600)
 *
 * GET /api/eurostat?indicator=inflation&countries=IT,DE&periods=24
 */

import { fetchEurostatData, EuroIndicatorSchema } from "@/app/utils/eurostat-client";
import { z } from "zod";

const QuerySchema = z.object({
  indicator: EuroIndicatorSchema,
  countries: z.string().transform((s) =>
    s.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean)
  ),
  periods: z.coerce.number().int().min(1).max(60).default(24),
});

export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);

  const parsed = QuerySchema.safeParse({
    indicator: searchParams.get("indicator"),
    countries: searchParams.get("countries") ?? "IT",
    periods:   searchParams.get("periods")   ?? "24",
  });

  if (!parsed.success) {
    return new Response(
      JSON.stringify({
        error: "Invalid parameters",
        details: parsed.error.flatten(),
        hint: "indicator must be one of: inflation | unemployment | energy_prices | gdp_growth",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const result = await fetchEurostatData(parsed.data);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        "Content-Type":  "application/json",
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200",
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[EurostatProxy] Error:", msg);

    return new Response(
      JSON.stringify({
        error: "Impossibile recuperare i dati da Eurostat.",
        detail: msg,
        timestamp: new Date().toISOString(),
      }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }
}
