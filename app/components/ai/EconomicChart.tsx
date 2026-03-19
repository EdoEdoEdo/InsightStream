"use client";

/**
 * @file app/components/ai/EconomicChart.tsx
 * @description Generative UI for Eurostat multi-country time series.
 *
 * Renders a responsive multi-line chart where each country = one line.
 * Handles monthly, quarterly, and semi-annual data automatically.
 */

import React, { memo } from "react";
import { motion } from "framer-motion";
import {
  LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import type { EurostatResult } from "@/app/utils/eurostat-client";
import type { EuroRecord } from "@/app/utils/eurostat-client";
import { formatPeriod } from "@/app/utils/eurostat-client";

// Indicators where a higher value is bad (red ↑, green ↓)
const HIGHER_IS_BAD = new Set([
  "unemployment", "public_debt", "energy_prices", "neet_youth", "inflation"
]);
import { ExportButton } from "@/app/components/ui/ExportButton";

// ─── Country color palette ────────────────────────────────────────────────────

const COUNTRY_COLORS: Record<string, string> = {
  IT:        "#00d4ff",   // cyan   — Italy
  DE:        "#ff8c42",   // amber  — Germany
  FR:        "#a78bfa",   // purple — France
  ES:        "#22d3a5",   // green  — Spain
  EU27_2020: "#fbbf24",   // yellow — EU average
  EA20:      "#fb923c",   // orange — Eurozone
  PL:        "#f472b6",   // pink   — Poland
  NL:        "#34d399",   // teal   — Netherlands
  PT:        "#60a5fa",   // blue   — Portugal
  GR:        "#f87171",   // red    — Greece
};

const FALLBACK_COLORS = [
  "#00d4ff","#ff8c42","#a78bfa","#22d3a5",
  "#fbbf24","#fb923c","#f472b6","#34d399",
];

function getCountryColor(code: string, index: number): string {
  return COUNTRY_COLORS[code] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

// ─── Data transformation ──────────────────────────────────────────────────────

interface ChartDataPoint {
  period:    string;
  periodLabel: string;
  [countryCode: string]: string | number;
}

function buildChartData(
  records: EuroRecord[],
  countries: string[]
): ChartDataPoint[] {
  // Collect all unique periods
  const periods = [...new Set(records.map((r) => r.period))].sort();

  return periods.map((period) => {
    const point: ChartDataPoint = {
      period,
      periodLabel: formatPeriod(period),
    };
    for (const country of countries) {
      const record = records.find(
        (r) => r.country === country && r.period === period
      );
      if (record) point[country] = record.value;
    }
    return point;
  });
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────

interface TooltipEntry {
  dataKey:  string;
  value:    number;
  color:    string;
  name:     string;
}

interface CustomTooltipProps {
  active?:  boolean;
  payload?: TooltipEntry[];
  label?:   string;
  unit:     string;
  records:  EuroRecord[];
}

function CustomTooltip({
  active, payload, label, unit, records,
}: CustomTooltipProps): React.ReactElement | null {
  if (!active || !payload?.length || !label) return null;

  return (
    <div
      className="rounded-lg border border-white/15 px-4 py-3 shadow-2xl min-w-[160px]"
      style={{ background: "#0f1117" }}
    >
      <p className="font-mono text-[10px] text-white/40 uppercase tracking-widest mb-2">
        {label}
      </p>
      {payload.map((entry) => {
        const countryRecord = records.find((r) => r.country === entry.dataKey);
        return (
          <div key={entry.dataKey} className="flex items-center justify-between gap-4 mb-1">
            <div className="flex items-center gap-1.5">
              <div
                className="w-2 h-2 rounded-full"
                style={{ background: entry.color }}
              />
              <span className="font-mono text-[10px] text-white/60">
                {countryRecord?.countryLabel ?? entry.dataKey}
              </span>
            </div>
            <span
              className="font-mono text-sm font-semibold tabular-nums"
              style={{ color: entry.color }}
            >
              {entry.value?.toFixed(2)}{unit}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Stat summary cards ───────────────────────────────────────────────────────

function CountrySummary({
  records,
  countries,
  unit,
  indicator,
}: {
  records:   EuroRecord[];
  countries: string[];
  unit:      string;
  indicator: string;
}): React.ReactElement {
  // Get the latest value per country
  const latest = countries.map((code, i) => {
    const countryRecords = records
      .filter((r) => r.country === code)
      .sort((a, b) => b.period.localeCompare(a.period));
    const last    = countryRecords[0];
    const prev    = countryRecords[1];
    const delta   = last && prev ? last.value - prev.value : null;
    return { code, last, delta, color: getCountryColor(code, i) };
  }).filter((c) => c.last);

  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${Math.min(latest.length, 4)}, 1fr)` }}
    >
      {latest.map(({ code, last, delta, color }) => (
        <div
          key={code}
          className="rounded-lg px-3 py-2.5 border border-white/6"
          style={{ background: `${color}08` }}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
            <span className="font-mono text-[9px] uppercase tracking-widest text-white/40">
              {last.countryLabel}
            </span>
          </div>
          <p
            className="font-mono text-base font-semibold tabular-nums"
            style={{ color }}
          >
            {last.value.toFixed(2)}{unit}
          </p>
          {delta !== null && (
            <p
              className="font-mono text-[10px] mt-0.5"
              style={{ color: delta === 0 ? "rgba(255,255,255,0.3)" :
                (delta > 0) === !HIGHER_IS_BAD.has(indicator)
                  ? "#22d3a5"   // good direction
                  : "#ff4d6d"   // bad direction
              }}
            >
              {delta > 0 ? "↑" : delta < 0 ? "↓" : "—"}{" "}
              {Math.abs(delta).toFixed(2)}{unit}
            </p>
          )}
          <p className="font-mono text-[9px] text-white/25 mt-0.5">
            {formatPeriod(last.period)}
          </p>
        </div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export interface EconomicChartProps {
  result: EurostatResult;
}

export const EconomicChart = memo(function EconomicChart({
  result,
}: EconomicChartProps): React.ReactElement {
  const {
    indicator,
    indicatorLabel,
    unit,
    countries,
    records,
    fetchedAt,
    fromCache,
  } = result;

  const chartId   = `chart-euro-${indicator}-${countries.join("-")}`;
  const chartData = buildChartData(records, countries);

  // Need at least 2 points for a meaningful line/area chart
  // If only 1 data point, render a simple card instead
  const hasNegative = records.some((r) => r.value < 0);
  const hasSinglePeriod = chartData.length <= 1;

  const axisProps = {
    tick:     { fill: "rgba(255,255,255,0.35)", fontSize: 10, fontFamily: "DM Mono, monospace" },
    axisLine: { stroke: "rgba(255,255,255,0.06)" },
    tickLine: false,
  };

  const timestamp = new Date(fetchedAt).toLocaleString("it-IT", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

  // Accent color = first country's color
  const accentColor = getCountryColor(countries[0], 0);

  return (
    <motion.div
      id={chartId}
      initial={{ opacity: 0, y: 12, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="w-full rounded-xl border border-white/10 bg-[#0a0c12] overflow-hidden"
      style={{ boxShadow: `0 0 0 1px ${accentColor}08, 0 24px 64px rgba(0,0,0,0.6)` }}
    >
      {/* Top accent line */}
      <div
        className="h-px w-full"
        style={{ background: `linear-gradient(90deg, transparent, ${accentColor}60, transparent)` }}
      />

      <div className="p-6 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div
                className="font-mono text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-sm"
                style={{ color: accentColor, background: `${accentColor}15`, border: `1px solid ${accentColor}25` }}
              >
                Eurostat · Live
              </div>
              {fromCache && (
                <span className="font-mono text-[9px] text-white/20">cache</span>
              )}
            </div>
            <h3 className="text-xl font-semibold text-white tracking-tight">
              {indicatorLabel}
            </h3>
            <p className="font-mono text-xs text-white/30 mt-0.5">
              {countries.length} {countries.length === 1 ? "paese" : "paesi"} · {chartData.length} periodi · {timestamp}
            </p>
          </div>
          <div data-export-hide="">
          <ExportButton
            targetId={chartId}
            filename={`EuroStream_${indicator}_${countries.join("-")}`}
          />
          </div>
        </div>

        {/* No data state */}
        {records.length === 0 ? (
          <div className="flex items-center justify-center h-40 rounded-lg border border-white/8 bg-white/2">
            <p className="font-mono text-sm text-white/30">
              Nessun dato disponibile per il periodo richiesto.
            </p>
          </div>
        ) : hasSinglePeriod ? (
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(countries.length, 4)}, 1fr)` }}>
            {countries.map((code, i) => {
              const rec = records.find((r) => r.country === code);
              if (!rec) return null;
              const color = getCountryColor(code, i);
              return (
                <div key={code} className="rounded-lg px-4 py-4 border border-white/8" style={{ background: `${color}08` }}>
                  <div className="flex items-center gap-1.5 mb-2">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                    <span className="font-mono text-[9px] uppercase tracking-widest text-white/40">{rec.countryLabel}</span>
                  </div>
                  <p className="font-mono text-xl font-bold tabular-nums" style={{ color }}>
                    {rec.value.toFixed(2)}{unit}
                  </p>
                  <p className="font-mono text-[9px] text-white/25 mt-1">{formatPeriod(rec.period)}</p>
                </div>
              );
            })}
          </div>
        ) : (
          <>
            {/* Multi-line chart */}
            <ResponsiveContainer width="100%" height={240}>
              {hasNegative ? (
                <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    {countries.map((code, i) => {
                      const color = getCountryColor(code, i);
                      return (
                        <linearGradient key={code} id={`grad-${code}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor={color} stopOpacity={0.15} />
                          <stop offset="95%" stopColor={color} stopOpacity={0.01} />
                        </linearGradient>
                      );
                    })}
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                  <XAxis dataKey="periodLabel" {...axisProps} interval="preserveStartEnd" />
                  <YAxis {...axisProps} tickFormatter={(v: number) => `${v}${unit}`} width={58} />
                  <Tooltip content={<CustomTooltip unit={unit} records={records} />} />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" strokeWidth={1} />
                  {countries.map((code, i) => {
                    const color = getCountryColor(code, i);
                    return (
                      <Area
                        key={code}
                        type="monotone"
                        dataKey={code}
                        stroke={color}
                        strokeWidth={2}
                        fill={`url(#grad-${code})`}
                        dot={false}
                        activeDot={{ r: 4, fill: color, strokeWidth: 0 }}
                        connectNulls
                      />
                    );
                  })}
                </AreaChart>
              ) : (
                <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                  <XAxis dataKey="periodLabel" {...axisProps} interval="preserveStartEnd" />
                  <YAxis {...axisProps} tickFormatter={(v: number) => `${v}${unit}`} width={58} />
                  <Tooltip content={<CustomTooltip unit={unit} records={records} />} />
                  {countries.map((code, i) => {
                    const color = getCountryColor(code, i);
                    return (
                      <Line
                        key={code}
                        type="monotone"
                        dataKey={code}
                        stroke={color}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4, fill: color, strokeWidth: 0 }}
                        connectNulls
                      />
                    );
                  })}
                </LineChart>
              )}
            </ResponsiveContainer>

            {/* Legend */}
            <div className="flex flex-wrap gap-3">
              {countries.map((code, i) => {
                const label = records.find((r) => r.country === code)?.countryLabel ?? code;
                return (
                  <div key={code} className="flex items-center gap-1.5">
                    <div className="w-3 h-0.5 rounded-full" style={{ background: getCountryColor(code, i) }} />
                    <span className="font-mono text-[10px] text-white/50">{label}</span>
                  </div>
                );
              })}
            </div>

            {/* Country summary cards */}
            <CountrySummary records={records} countries={countries} unit={unit} indicator={indicator} />
          </>
        )}
      </div>
    </motion.div>
  );
});

EconomicChart.displayName = "EconomicChart";
