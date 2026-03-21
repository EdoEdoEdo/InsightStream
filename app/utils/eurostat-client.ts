/**
 * @file app/utils/eurostat-client.ts
 * @description Eurostat Statistics API client.
 *
 * Parses JSON-stat format returned by:
 * https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/{datasetCode}
 *
 * JSON-stat is a cube model: values are a flat array indexed by
 * the cartesian product of all dimensions (geo × time × unit...).
 * We unpack it into our normalized EuroRecord[].
 */

import { z } from "zod";

// ─── Domain types ─────────────────────────────────────────────────────────────

export const EuroIndicatorSchema = z.enum([
  "inflation",
  "unemployment",
  "energy_prices",
  "gdp_growth",
  "consumer_confidence",
  "house_prices",
  "neet_youth",
  "renewables",
  "public_debt",
  "industrial_production",
]);
export type EuroIndicator = z.infer<typeof EuroIndicatorSchema>;

export const EuroRecordSchema = z.object({
  country:   z.string().min(2).max(12),   // ISO alpha-2 or aggregate codes (EU27_2020, EA20)
  countryLabel: z.string(),
  indicator: EuroIndicatorSchema,
  value:     z.number().finite(),
  period:    z.string(),             // "2024-M01" | "2024-Q1" | "2024"
  unit:      z.string(),
});
export type EuroRecord = z.infer<typeof EuroRecordSchema>;

// ─── Indicator config ─────────────────────────────────────────────────────────

export interface IndicatorConfig {
  label:       string;
  unit:        string;
  unitCode:    string;
  datasetCode: string;
  frequency:   "monthly" | "quarterly" | "semi-annual" | "annual";
  defaultPeriods?: number;  // override default 24-month window for this indicator
  extraParams: Record<string, string>;
  description: string;
}

export const INDICATORS: Record<EuroIndicator, IndicatorConfig> = {
  inflation: {
    label:       "Inflazione HICP",
    unit:        "%",
    unitCode:    "RCH_A",         // annual rate of change
    datasetCode: "prc_hicp_manr",
    frequency:   "monthly",
    extraParams: { coicop: "CP00" }, // all-items index
    description: "Variazione % annua dei prezzi al consumo (HICP)",
  },
  unemployment: {
    label:       "Tasso di Disoccupazione",
    unit:        "%",
    unitCode:    "PC_ACT",        // % of active population
    datasetCode: "une_rt_m",
    frequency:   "monthly",
    extraParams: { sex: "T", age: "TOTAL", unit: "PC_ACT" },
    description: "% della forza lavoro disoccupata (destagionalizzato)",
  },
  energy_prices: {
    label:       "Prezzi Elettricità Famiglie",
    unit:        "€/kWh",
    unitCode:    "KWH",
    datasetCode: "nrg_pc_204",
    frequency:   "semi-annual",
    defaultPeriods: 120,  // 10 years = 20 semi-annual observations
    // currency=EUR: prices in euro; tax=X_TAX: excluding taxes;
    // nrg_cons=KWH1000-2499: median consumption band (most representative)
    extraParams: { currency: "EUR", tax: "X_TAX", nrg_cons: "KWH1000-2499" },
    description: "Prezzo elettricità per famiglie (€/kWh, IVA esclusa)",
  },
  gdp_growth: {
    label:       "Crescita PIL",
    unit:        "%",
    unitCode:    "CLV_PCH_PRE",   // % change vs previous quarter
    datasetCode: "namq_10_gdp",
    frequency:   "quarterly",
    extraParams: { unit: "CLV_PCH_PRE", s_adj: "SCA", na_item: "B1GQ" },
    description: "Variazione % del PIL reale (trimestrale, destagionalizzato)",
  },
  consumer_confidence: {
    label:       "Fiducia dei Consumatori",
    unit:        "punti",
    unitCode:    "BAL",
    datasetCode: "ei_bsco_m",
    frequency:   "monthly",
    // s_adj=SA: seasonally adjusted; indic=BS-CSMCI-BAL is the composite index
    // Using minimal params to avoid 400 errors from wrong filter combinations
    // Dimension structure: FREQ.INDIC.S_ADJ.UNIT.GEO
    // indic=BS-CSMCI, s_adj=NSA (more country coverage), unit=BAL
    extraParams: { indic: "BS-CSMCI", s_adj: "NSA", unit: "BAL" },
    description: "Indice di fiducia dei consumatori (saldo opinioni, destagionalizzato)",
  },
  house_prices: {
    label:       "Prezzi Immobili Residenziali",
    unit:        "indice",
    unitCode:    "I15_NSA",
    datasetCode: "prc_hpi_q",
    frequency:   "quarterly",
    defaultPeriods: 120,  // 10 years = 40 quarterly observations
    extraParams: { purchase: "DW_EXST" },  // DW_EXST=existing dwellings (confirmed from DBnomics series format)
    description: "Indice prezzi abitazioni (base 2015=100, tutte le transazioni)",
  },
  neet_youth: {
    label:       "Giovani NEET (15-29 anni)",
    unit:        "%",
    unitCode:    "PC",
    datasetCode: "edat_lfse_20",
    frequency:   "annual",
    defaultPeriods: 120,  // 10 years = 10 annual observations
    extraParams: { sex: "T", age: "Y15-29" },
    description: "% giovani 15-29 anni non occupati né in istruzione/formazione (annuale)",
  },
  renewables: {
    label:       "Quota Energia Rinnovabile",
    unit:        "%",
    unitCode:    "PC",
    datasetCode: "nrg_ind_ren",
    frequency:   "annual",
    defaultPeriods: 240,  // 20 years — shows the full renewable energy transition
    extraParams: { nrg_bal: "REN", unit: "PC" },  // REN=renewable overall, PC=percentage
    description: "% energia da fonti rinnovabili sul consumo finale lordo di energia",
  },
  industrial_production: {
    label:       "Produzione Industriale",
    unit:        "indice",
    unitCode:    "I21",
    datasetCode: "sts_inpr_m",
    frequency:   "monthly",
    // Confirmed from DBnomics series: M.PRD.C.SCA.I21.IT
    // nace_r2=C: manufacturing (most representative, excl. mining+utilities)
    // s_adj=SCA: seasonally and calendar adjusted
    // unit=I21: index 2021=100
    extraParams: { nace_r2: "C", s_adj: "SCA", unit: "I21" },  // indic removed — parser takes pos[0]
    description: "Indice produzione manifatturiera (base 2021=100, destagionalizzato)",
  },
  public_debt: {
    label:       "Debito Pubblico (% PIL)",
    unit:        "%",
    unitCode:    "PC_GDP",
    datasetCode: "gov_10dd_edpt1",
    frequency:   "annual",
    defaultPeriods: 120,  // 10 years = 10 annual observations
    extraParams: { na_item: "GD", unit: "PC_GDP", sector: "S13" },
    description: "Debito pubblico consolidato delle amministrazioni pubbliche (% PIL)",
  },
};

// ─── Country labels ───────────────────────────────────────────────────────────

export const COUNTRY_LABELS: Record<string, string> = {
  IT: "Italia",      DE: "Germania",  FR: "Francia",
  ES: "Spagna",      PL: "Polonia",   NL: "Paesi Bassi",
  BE: "Belgio",      SE: "Svezia",    AT: "Austria",
  PT: "Portogallo",  GR: "Grecia",    EU27_2020: "Media EU27",
  EA20: "Eurozona",  CZ: "Cechia",    HU: "Ungheria",
  RO: "Romania",     DK: "Danimarca", FI: "Finlandia",
};

// ─── JSON-stat parser ─────────────────────────────────────────────────────────

interface JsonStatDimension {
  label:    string;
  category: {
    index:  Record<string, number>;
    label:  Record<string, string>;
  };
}

export interface JsonStatResponse {
  class:  string;
  label:  string;
  value:  (number | null)[];
  dimension: Record<string, JsonStatDimension>;
  id:     string[];
  size:   number[];
}

/**
 * Unpacks a JSON-stat response into flat EuroRecord[].
 *
 * JSON-stat stores values in a flat array indexed by the cartesian product
 * of ALL dimensions. We must compute the correct flat index by accounting
 * for EVERY dimension, not just geo and time.
 *
 * Example: dims = [FREQ, UNIT, S_ADJ, SEX, AGE, GEO, TIME]
 * sizes  = [1,    3,    1,     1,    1,   30,  24 ]
 * strides= [2160, 720,  720,   720,  720, 24,  1  ]
 *
 * If UNIT has multiple categories (e.g. PC_ACT at pos 0, THS_PER at pos 1),
 * the previous formula geoPos*strides[geo] + timePos*strides[time] would
 * land on THS_PER values (~1258 thousand) instead of PC_ACT values (~8.1%).
 */
export function parseJsonStat(
  raw: JsonStatResponse,
  indicator: EuroIndicator,
  requestedCountries: string[]
): EuroRecord[] {
  const config   = INDICATORS[indicator];
  const dimIds   = raw.id;
  const dimSizes = raw.size;

  // Build stride array (row-major order)
  const strides: number[] = new Array(dimIds.length).fill(1);
  for (let i = dimIds.length - 2; i >= 0; i--) {
    strides[i] = strides[i + 1] * dimSizes[i + 1];
  }

  const geoIdx  = dimIds.indexOf("geo");
  const timeIdx = dimIds.indexOf("time");

  if (geoIdx === -1 || timeIdx === -1) {
    console.warn("[EurostatClient] Missing geo or time dimension in", dimIds);
    return [];
  }

  const geoDim  = raw.dimension["geo"];
  const timeDim = raw.dimension["time"];

  // For every non-geo/non-time dimension, pin to position 0.
  // When extraParams already filtered to a single category (e.g. unit=PC_ACT)
  // this position IS the correct one. If multiple remain, we take index 0
  // which is the first category returned — callers should filter upstream.
  const baseOffset = dimIds.reduce((acc, dimId, i) => {
    if (i === geoIdx || i === timeIdx) return acc;
    return acc; // position 0 contributes 0 * stride = 0
  }, 0);

  const records: EuroRecord[] = [];

  for (const [geoCode, geoPos] of Object.entries(geoDim.category.index)) {
    if (requestedCountries.length > 0 && !requestedCountries.includes(geoCode)) continue;

    const countryLabel =
      COUNTRY_LABELS[geoCode] ??
      geoDim.category.label[geoCode] ??
      geoCode;

    for (const [period, timePos] of Object.entries(timeDim.category.index)) {
      // Full flat index: base (non-geo/time dims at pos 0) + geo offset + time offset
      const flatIndex =
        baseOffset +
        (geoPos as number) * strides[geoIdx] +
        (timePos as number) * strides[timeIdx];

      const value = raw.value[flatIndex];
      if (value === null || value === undefined) continue;

      const validation = EuroRecordSchema.safeParse({
        country:      geoCode,
        countryLabel,
        indicator,
        value,
        period,
        unit: config.unit,
      });

      if (validation.success) records.push(validation.data);
    }
  }

  return records.sort((a, b) =>
    a.country.localeCompare(b.country) || a.period.localeCompare(b.period)
  );
}

// ─── Shared result type (used by route.ts + EconomicChart.tsx) ───────────────

export interface EurostatResult {
  indicator:      string;
  indicatorLabel: string;
  unit:           string;
  countries:      string[];
  records:        EuroRecord[];
  fetchedAt:      string;
  fromCache:      boolean;
}

// ─── In-memory cache ──────────────────────────────────────────────────────────

interface CacheEntry {
  records:   EuroRecord[];
  fetchedAt: number;
}

const CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function getCacheKey(
  indicator: EuroIndicator,
  countries: string[],
  periods: number
): string {
  return `${indicator}__${[...countries].sort().join(",")}__${periods}`;
}

// ─── Main fetch function ──────────────────────────────────────────────────────

export interface FetchOptions {
  indicator: EuroIndicator;
  countries: string[];    // ISO codes e.g. ["IT", "DE", "EU27_2020"]
  lastPeriods?: number;   // how many MONTHS back (default 24) — auto-converted per frequency
}

/**
 * Converts a number of months into the correct number of Eurostat observations
 * based on the dataset frequency. Eurostat's lastTimePeriod = last N observations.
 *
 * Examples (24 months):
 *   monthly      → 24 observations
 *   quarterly    → 8 observations
 *   semi-annual  → 4 observations
 *   annual       → 2 observations
 */
export function monthsToObservations(months: number, frequency: IndicatorConfig["frequency"]): number {
  switch (frequency) {
    case "monthly":     return months;
    case "quarterly":   return Math.ceil(months / 3);
    case "semi-annual": return Math.ceil(months / 6);
    case "annual":      return Math.ceil(months / 12);
    default:            return Math.ceil(months / 12);
  }
}

export interface FetchResult {
  records:     EuroRecord[];
  fetchedAt:   string;
  fromCache:   boolean;
  indicator:   EuroIndicator;
  config:      IndicatorConfig;
}

export async function fetchEurostatData(
  options: FetchOptions
): Promise<FetchResult> {
  const { indicator, countries, lastPeriods = INDICATORS[indicator].defaultPeriods ?? 24 } = options;
  const config = INDICATORS[indicator];

  // Check cache first
  const cacheKey = getCacheKey(indicator, countries, lastPeriods);
  const cached   = CACHE.get(cacheKey);
  const now      = Date.now();

  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return {
      records:   cached.records,
      fetchedAt: new Date(cached.fetchedAt).toISOString(),
      fromCache: true,
      indicator,
      config,
    };
  }

  // Build Eurostat API URL
  const params = new URLSearchParams({
    lang:            "EN",
      lastTimePeriod:  String(monthsToObservations(lastPeriods, config.frequency)),
    ...config.extraParams,
  });

  // Add geo filters
  countries.forEach((c) => params.append("geo", c));

  const url = `https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/${config.datasetCode}?${params.toString()}`;

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    // Next.js cache: revalidate every hour
    next: { revalidate: 3600 },
  } as RequestInit);

  if (!response.ok) {
    throw new Error(
      `Eurostat API error ${response.status} for ${config.datasetCode}: ${await response.text()}`
    );
  }

  const raw = (await response.json()) as JsonStatResponse;
  const records = parseJsonStat(raw, indicator, countries);

  // Store in cache
  CACHE.set(cacheKey, { records, fetchedAt: now });

  return {
    records,
    fetchedAt: new Date(now).toISOString(),
    fromCache: false,
    indicator,
    config,
  };
}

// ─── Period formatter ─────────────────────────────────────────────────────────

/** Converts Eurostat period codes to readable Italian labels */
export function formatPeriod(period: string): string {
  // Monthly: "2024-M01" → "Gen 2024"
  const monthly = period.match(/^(\d{4})-M(\d{2})$/);
  if (monthly) {
    const months = ["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"];
    return `${months[parseInt(monthly[2]) - 1]} ${monthly[1]}`;
  }
  // Quarterly: "2024-Q1" → "Q1 2024"
  const quarterly = period.match(/^(\d{4})-Q(\d)$/);
  if (quarterly) return `Q${quarterly[2]} ${quarterly[1]}`;
  // Semi-annual: "2024-S1" → "S1 2024"
  const semi = period.match(/^(\d{4})-S(\d)$/);
  if (semi) return `S${semi[2]} ${semi[1]}`;
  return period;
}
