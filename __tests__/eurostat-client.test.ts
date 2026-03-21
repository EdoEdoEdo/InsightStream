/**
 * @file __tests__/eurostat-client.test.ts
 * @description Unit tests for eurostat-client.ts utilities.
 *
 * Covers:
 *   - monthsToObservations: frequency-based period conversion
 *   - parseJsonStat: JSON-stat cube unpacking
 *   - EuroRecordSchema: Zod validation (incl. aggregate country codes fix)
 *   - formatPeriod: period label formatting
 */

import { describe, it, expect } from "vitest";
import {
  monthsToObservations,
  parseJsonStat,
  EuroRecordSchema,
  formatPeriod,
  type JsonStatResponse,
  type EuroIndicator,
} from "@/app/utils/eurostat-client";

// ─── monthsToObservations ─────────────────────────────────────────────────────

describe("monthsToObservations", () => {
  it("returns months unchanged for monthly frequency", () => {
    expect(monthsToObservations(24, "monthly")).toBe(24);
    expect(monthsToObservations(12, "monthly")).toBe(12);
    expect(monthsToObservations(1, "monthly")).toBe(1);
  });

  it("converts months to quarters (ceil)", () => {
    expect(monthsToObservations(24, "quarterly")).toBe(8);
    expect(monthsToObservations(12, "quarterly")).toBe(4);
    expect(monthsToObservations(7, "quarterly")).toBe(3);  // ceil(7/3) = 3
  });

  it("converts months to semi-annual (ceil)", () => {
    expect(monthsToObservations(24, "semi-annual")).toBe(4);
    expect(monthsToObservations(120, "semi-annual")).toBe(20);
    expect(monthsToObservations(5, "semi-annual")).toBe(1);  // ceil(5/6) = 1
  });

  it("converts months to annual (ceil)", () => {
    expect(monthsToObservations(24, "annual")).toBe(2);
    expect(monthsToObservations(120, "annual")).toBe(10);
    expect(monthsToObservations(13, "annual")).toBe(2);  // ceil(13/12) = 2
  });

  it("handles edge cases", () => {
    expect(monthsToObservations(3, "monthly")).toBe(3);
    expect(monthsToObservations(3, "quarterly")).toBe(1);
    expect(monthsToObservations(240, "annual")).toBe(20);
  });
});

// ─── EuroRecordSchema ─────────────────────────────────────────────────────────

describe("EuroRecordSchema", () => {
  const baseRecord = {
    country: "IT",
    countryLabel: "Italia",
    indicator: "inflation" as const,
    value: 2.5,
    period: "2024-M01",
    unit: "%",
  };

  it("validates a standard 2-char country code", () => {
    const result = EuroRecordSchema.safeParse(baseRecord);
    expect(result.success).toBe(true);
  });

  it("validates EU27_2020 aggregate code (was previously broken with .length(2))", () => {
    const result = EuroRecordSchema.safeParse({
      ...baseRecord,
      country: "EU27_2020",
      countryLabel: "Media EU27",
    });
    expect(result.success).toBe(true);
  });

  it("validates EA20 eurozone code", () => {
    const result = EuroRecordSchema.safeParse({
      ...baseRecord,
      country: "EA20",
      countryLabel: "Eurozona",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty country code", () => {
    const result = EuroRecordSchema.safeParse({ ...baseRecord, country: "" });
    expect(result.success).toBe(false);
  });

  it("rejects single-char country code", () => {
    const result = EuroRecordSchema.safeParse({ ...baseRecord, country: "I" });
    expect(result.success).toBe(false);
  });

  it("rejects non-finite values", () => {
    expect(
      EuroRecordSchema.safeParse({ ...baseRecord, value: Infinity }).success,
    ).toBe(false);
    expect(
      EuroRecordSchema.safeParse({ ...baseRecord, value: NaN }).success,
    ).toBe(false);
  });

  it("validates all indicator enum values", () => {
    const indicators: EuroIndicator[] = [
      "inflation", "unemployment", "energy_prices", "gdp_growth",
      "consumer_confidence", "house_prices", "neet_youth",
      "renewables", "public_debt", "industrial_production",
    ];
    for (const indicator of indicators) {
      const result = EuroRecordSchema.safeParse({ ...baseRecord, indicator });
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid indicator", () => {
    const result = EuroRecordSchema.safeParse({
      ...baseRecord,
      indicator: "nonexistent",
    });
    expect(result.success).toBe(false);
  });
});

// ─── parseJsonStat ────────────────────────────────────────────────────────────

describe("parseJsonStat", () => {
  /**
   * Minimal JSON-stat cube with 2 countries × 3 time periods.
   * Dimensions: [geo, time] — simplest case.
   */
  function makeMockJsonStat(overrides?: Partial<JsonStatResponse>): JsonStatResponse {
    return {
      class: "dataset",
      label: "Test dataset",
      id: ["geo", "time"],
      size: [2, 3],
      value: [
        1.1, 1.2, 1.3,   // IT: 2024-M01, 2024-M02, 2024-M03
        2.1, 2.2, 2.3,   // DE: 2024-M01, 2024-M02, 2024-M03
      ],
      dimension: {
        geo: {
          label: "Geopolitical entity",
          category: {
            index: { IT: 0, DE: 1 },
            label: { IT: "Italy", DE: "Germany" },
          },
        },
        time: {
          label: "Time",
          category: {
            index: { "2024-M01": 0, "2024-M02": 1, "2024-M03": 2 },
            label: { "2024-M01": "2024M01", "2024-M02": "2024M02", "2024-M03": "2024M03" },
          },
        },
      },
      ...overrides,
    };
  }

  it("unpacks a simple 2×3 cube into 6 records", () => {
    const records = parseJsonStat(makeMockJsonStat(), "inflation", ["IT", "DE"]);
    expect(records).toHaveLength(6);
  });

  it("extracts correct values per country and period", () => {
    const records = parseJsonStat(makeMockJsonStat(), "inflation", ["IT", "DE"]);

    const it01 = records.find((r) => r.country === "IT" && r.period === "2024-M01");
    expect(it01?.value).toBe(1.1);

    const de03 = records.find((r) => r.country === "DE" && r.period === "2024-M03");
    expect(de03?.value).toBe(2.3);
  });

  it("filters by requested countries", () => {
    const records = parseJsonStat(makeMockJsonStat(), "inflation", ["IT"]);
    expect(records).toHaveLength(3);
    expect(records.every((r) => r.country === "IT")).toBe(true);
  });

  it("returns all countries when requestedCountries is empty", () => {
    const records = parseJsonStat(makeMockJsonStat(), "inflation", []);
    expect(records).toHaveLength(6);
  });

  it("skips null values in the cube", () => {
    const raw = makeMockJsonStat({
      value: [1.1, null, 1.3, 2.1, 2.2, null] as (number | null)[],
    });
    const records = parseJsonStat(raw, "inflation", []);
    expect(records).toHaveLength(4);
  });

  it("returns empty array when geo dimension is missing", () => {
    const raw = makeMockJsonStat();
    raw.id = ["country", "time"]; // wrong dim name
    const records = parseJsonStat(raw, "inflation", []);
    expect(records).toHaveLength(0);
  });

  it("returns empty array when time dimension is missing", () => {
    const raw = makeMockJsonStat();
    raw.id = ["geo", "period"]; // wrong dim name
    const records = parseJsonStat(raw, "inflation", []);
    expect(records).toHaveLength(0);
  });

  it("records are sorted by country then period", () => {
    const records = parseJsonStat(makeMockJsonStat(), "inflation", ["IT", "DE"]);
    const keys = records.map((r) => `${r.country}:${r.period}`);
    const sorted = [...keys].sort();
    expect(keys).toEqual(sorted);
  });

  it("assigns correct countryLabel from COUNTRY_LABELS", () => {
    const records = parseJsonStat(makeMockJsonStat(), "inflation", ["IT"]);
    expect(records[0].countryLabel).toBe("Italia"); // from COUNTRY_LABELS
  });

  it("handles EU27_2020 aggregate country code", () => {
    const raw: JsonStatResponse = {
      class: "dataset",
      label: "Test",
      id: ["geo", "time"],
      size: [1, 2],
      value: [3.5, 3.8],
      dimension: {
        geo: {
          label: "Geo",
          category: {
            index: { EU27_2020: 0 },
            label: { EU27_2020: "European Union" },
          },
        },
        time: {
          label: "Time",
          category: {
            index: { "2024-M01": 0, "2024-M02": 1 },
            label: { "2024-M01": "2024M01", "2024-M02": "2024M02" },
          },
        },
      },
    };
    const records = parseJsonStat(raw, "inflation", ["EU27_2020"]);
    expect(records).toHaveLength(2);
    expect(records[0].country).toBe("EU27_2020");
    expect(records[0].countryLabel).toBe("Media EU27");
  });

  it("handles multi-dimension cube (3+ dims)", () => {
    // Simulates: FREQ(1) × UNIT(1) × GEO(2) × TIME(2)
    const raw: JsonStatResponse = {
      class: "dataset",
      label: "Multi-dim",
      id: ["freq", "unit", "geo", "time"],
      size: [1, 1, 2, 2],
      value: [10.0, 10.5, 20.0, 20.5],
      dimension: {
        freq: {
          label: "Frequency",
          category: { index: { M: 0 }, label: { M: "Monthly" } },
        },
        unit: {
          label: "Unit",
          category: { index: { PC_ACT: 0 }, label: { PC_ACT: "%" } },
        },
        geo: {
          label: "Geo",
          category: { index: { IT: 0, DE: 1 }, label: { IT: "Italy", DE: "Germany" } },
        },
        time: {
          label: "Time",
          category: { index: { "2024-M01": 0, "2024-M02": 1 }, label: { "2024-M01": "Jan", "2024-M02": "Feb" } },
        },
      },
    };
    const records = parseJsonStat(raw, "unemployment", ["IT", "DE"]);
    expect(records).toHaveLength(4);

    const it01 = records.find((r) => r.country === "IT" && r.period === "2024-M01");
    expect(it01?.value).toBe(10.0);

    const de02 = records.find((r) => r.country === "DE" && r.period === "2024-M02");
    expect(de02?.value).toBe(20.5);
  });
});

// ─── formatPeriod ─────────────────────────────────────────────────────────────

describe("formatPeriod", () => {
  it("formats monthly periods to Italian abbreviation", () => {
    expect(formatPeriod("2024-M01")).toBe("Gen 2024");
    expect(formatPeriod("2024-M06")).toBe("Giu 2024");
    expect(formatPeriod("2024-M12")).toBe("Dic 2024");
  });

  it("formats quarterly periods", () => {
    expect(formatPeriod("2024-Q1")).toBe("Q1 2024");
    expect(formatPeriod("2024-Q4")).toBe("Q4 2024");
  });

  it("formats semi-annual periods", () => {
    expect(formatPeriod("2024-S1")).toBe("S1 2024");
    expect(formatPeriod("2024-S2")).toBe("S2 2024");
  });

  it("returns annual periods as-is", () => {
    expect(formatPeriod("2024")).toBe("2024");
  });

  it("returns unrecognized formats unchanged", () => {
    expect(formatPeriod("2024-W01")).toBe("2024-W01");
    expect(formatPeriod("unknown")).toBe("unknown");
  });
});
