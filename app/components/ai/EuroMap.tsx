"use client";

/**
 * @file app/components/ai/EuroMap.tsx
 * @description Interactive EU choropleth map powered by D3-geo + React SVG.
 *
 * Architecture:
 *   - D3 used ONLY for projection math + color scale (no DOM manipulation)
 *   - Rendering via React SVG — fully compatible with Next.js SSR
 *   - GeoJSON fetched from Eurostat GISCO public API (EU countries, 1:20M)
 *   - Color domain auto-scaled to min/max of current indicator across EU
 *   - Click on country → fires onCountryClick(isoCode, countryLabel)
 *   - Highlighted countries (from chat context) get cyan border
 */

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  memo,
  type ReactElement,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { geoMercator, geoPath, type GeoProjection } from "d3-geo";
import { scaleSequential } from "d3-scale";
import { interpolateRgb } from "d3-interpolate";
import type { FeatureCollection, Geometry } from "geojson";
import type { EuroIndicator } from "@/app/utils/eurostat-client";
import { INDICATORS, COUNTRY_LABELS } from "@/app/utils/eurostat-client";
import type { EuroRecord } from "@/app/utils/eurostat-client";

// ─── EU27 country codes ───────────────────────────────────────────────────────

const EU27 = new Set([
  "AT","BE","BG","CY","CZ","DE","DK","EE","ES","FI",
  "FR","GR","HR","HU","IE","IT","LT","LU","LV","MT",
  "NL","PL","PT","RO","SE","SI","SK",
]);

// ─── GeoJSON types ────────────────────────────────────────────────────────────

interface CountryProperties {
  CNTR_ID:   string;
  CNTR_NAME: string;
  NAME_ENGL: string;
}

type CountryFeature = GeoJSON.Feature<Geometry, CountryProperties>;
type CountryCollection = FeatureCollection<Geometry, CountryProperties>;

// ─── Color config ─────────────────────────────────────────────────────────────

// Low = cool blue-grey, High = vivid cyan
const COLOR_LOW  = "#1a2535";
const COLOR_HIGH = "#00d4ff";
const COLOR_NA   = "#151820";   // no data
const COLOR_NON_EU = "#0d0f16"; // outside EU

// ─── Props ────────────────────────────────────────────────────────────────────

export interface EuroMapProps {
  indicator:          EuroIndicator;
  onIndicatorChange:  (ind: EuroIndicator) => void;
  onCountryClick:     (code: string, label: string, indicator: EuroIndicator) => void;
  highlightedCountries?: string[];  // from chat context
}

// ─── Indicator selector ───────────────────────────────────────────────────────

function IndicatorSelector({
  value,
  onChange,
}: {
  value:    EuroIndicator;
  onChange: (v: EuroIndicator) => void;
}): ReactElement {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono transition-all duration-150 max-w-[140px] sm:max-w-none"
        style={{
          background: "rgba(0,212,255,0.08)",
          border:     "1px solid rgba(0,212,255,0.2)",
          color:      "#00d4ff",
          letterSpacing: "0.02em",
        }}
      >
        <span className="truncate">{INDICATORS[value].label}</span>
        <svg
          width="8" height="8" viewBox="0 0 8 8" fill="none"
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}
        >
          <path d="M1 2.5L4 5.5L7 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.12 }}
            className="absolute top-full left-0 mt-1 z-50 rounded-xl overflow-hidden min-w-[200px]"
            style={{ background: "#0e1018", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}
          >
            {(Object.keys(INDICATORS) as EuroIndicator[]).map((ind) => (
              <button
                key={ind}
                onClick={() => { onChange(ind); setOpen(false); }}
                className={`w-full text-left px-4 py-2.5 transition-all duration-100 flex items-center gap-2
                  font-mono text-[11px]
                  ${value === ind
                    ? "bg-[rgba(0,212,255,0.08)] text-[#00d4ff]"
                    : "bg-transparent text-white/55 hover:bg-white/[0.04]"
                  }`}
              >
                {value === ind && <div className="w-1 h-1 rounded-full bg-cyan-400 shrink-0" />}
                {INDICATORS[ind].label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Color legend ─────────────────────────────────────────────────────────────

function ColorLegend({
  min, max, unit,
}: {
  min: number; max: number; unit: string;
}): ReactElement {
  const steps = 5;
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[9px] text-white/30">{min.toFixed(1)}{unit}</span>
      <div className="flex rounded-sm overflow-hidden" style={{ width: 80, height: 6 }}>
        {Array.from({ length: steps }, (_, i) => {
          const t = i / (steps - 1);
          const color = interpolateRgb(COLOR_LOW, COLOR_HIGH)(t);
          return <div key={i} style={{ flex: 1, background: color }} />;
        })}
      </div>
      <span className="font-mono text-[9px] text-white/30">{max.toFixed(1)}{unit}</span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export const EuroMap = memo(function EuroMap({
  indicator,
  onIndicatorChange,
  onCountryClick,
  highlightedCountries = [],
}: EuroMapProps): ReactElement {
  const [geojson, setGeojson]     = useState<CountryCollection | null>(null);
  const [records, setRecords]     = useState<EuroRecord[]>([]);
  const [hoveredCode, setHovered] = useState<string | null>(null);
  const [loadingGeo, setLoadingGeo] = useState(true);
  const [loadingData, setLoadingData] = useState(true);
  const [tooltipPos, setTooltipPos]   = useState({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  const WIDTH  = 640;
  const HEIGHT = 480;

  // ── Fetch GeoJSON once ─────────────────────────────────────────────────────
  useEffect(() => {
    const GEOJSON_URL =
      "https://gisco-services.ec.europa.eu/distribution/v2/countries/geojson/CNTR_RG_20M_2020_4326.geojson";

    fetch(GEOJSON_URL)
      .then((r) => r.json())
      .then((data: CountryCollection) => {
        // Filter to EU27 + nearby countries for context
        const filtered: CountryCollection = {
          ...data,
          features: data.features.filter((f) => {
            const code = f.properties?.CNTR_ID;
            // Include EU + neighbours for visual context
            return ["AT","BE","BG","CY","CZ","DE","DK","EE","ES","FI",
                    "FR","GR","HR","HU","IE","IT","LT","LU","LV","MT",
                    "NL","PL","PT","RO","SE","SI","SK",
                    "NO","CH","GB","UA","RS","AL","MK","ME","BA","MD",
                    "BY","TR","IS",
                   ].includes(code);
          }),
        };
        setGeojson(filtered);
        setLoadingGeo(false);
      })
      .catch(() => setLoadingGeo(false));
  }, []);

  // ── Fetch indicator data for all EU27 ─────────────────────────────────────
  useEffect(() => {
    setLoadingData(true);
    const countries = Array.from(EU27).join(",");
    fetch(`/api/eurostat?indicator=${indicator}&countries=${countries}&periods=1`)
      .then((r) => r.json())
      .then((data) => {
        setRecords(data.records ?? []);
        setLoadingData(false);
      })
      .catch(() => setLoadingData(false));
  }, [indicator]);

  // ── Build D3 projection ────────────────────────────────────────────────────
  const projection = useCallback((): GeoProjection => {
    return geoMercator()
      .center([13, 52])
      .scale(520)
      .translate([WIDTH / 2, HEIGHT / 2]);
  }, []);

  // ── Build value map + color scale ──────────────────────────────────────────
  const { valueMap, colorScale, minVal, maxVal } = (() => {
    const map = new Map<string, number>();
    // Take the most recent value per country
    for (const rec of records) {
      if (!map.has(rec.country) || rec.period > (records.find(r => r.country === rec.country && map.has(rec.country))?.period ?? "")) {
        map.set(rec.country, rec.value);
      }
    }
    const values = Array.from(map.values());
    const minV = values.length ? Math.min(...values) : 0;
    const maxV = values.length ? Math.max(...values) : 1;

    const scale = scaleSequential()
      .domain([minV, maxV])
      .interpolator(interpolateRgb(COLOR_LOW, COLOR_HIGH));

    return { valueMap: map, colorScale: scale, minVal: minV, maxVal: maxV };
  })();

  // ── Path generator ─────────────────────────────────────────────────────────
  const pathGenerator = geoPath().projection(projection());

  // ── Render paths ───────────────────────────────────────────────────────────
  const paths = geojson?.features.map((feature) => {
    const code      = feature.properties?.CNTR_ID ?? "";
    const isEU      = EU27.has(code);
    const value     = valueMap.get(code);
    const isHovered = hoveredCode === code;
    const isHighlighted = highlightedCountries.includes(code);

    const fill = isEU
      ? value !== undefined
        ? (colorScale(value) as string)
        : COLOR_NA
      : COLOR_NON_EU;

    const d = pathGenerator(feature) ?? "";

    return { code, isEU, value, isHovered, isHighlighted, fill, d, feature };
  }) ?? [];

  // ── Hovered country info ───────────────────────────────────────────────────
  const hoveredInfo = hoveredCode
    ? {
        label: COUNTRY_LABELS[hoveredCode] ?? hoveredCode,
        value: valueMap.get(hoveredCode),
      }
    : null;

  const config = INDICATORS[indicator];

  return (
    <div className="w-full rounded-xl border border-white/10 bg-[#0a0c12] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-center gap-3">
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#00d4ff" }} />
          <span className="font-mono text-[10px] uppercase tracking-widest text-white/40">
            Mappa EU · Live
          </span>
          <IndicatorSelector value={indicator} onChange={onIndicatorChange} />
        </div>
        {!loadingData && records.length > 0 && (
          <ColorLegend min={minVal} max={maxVal} unit={config.unit} />
        )}
      </div>

      {/* Map area */}
      <div className="relative" style={{ background: "#07080d" }}>
        {(loadingGeo || loadingData) && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <motion.div
              className="w-5 h-5 rounded-full border-2 border-t-transparent"
              style={{ borderColor: "#00d4ff", borderTopColor: "transparent" }}
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
            />
          </div>
        )}

        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full"
          style={{ display: "block", opacity: loadingGeo ? 0.3 : 1, transition: "opacity 0.3s" }}
        >
          {/* Ocean background */}
          <rect width={WIDTH} height={HEIGHT} fill="#07080d" />

          {/* Country paths */}
          {paths.map(({ code, isEU, value, isHovered, isHighlighted, fill, d }) => (
            <path
              key={code}
              d={d}
              fill={fill}
              stroke={
                isHighlighted ? "#00d4ff"
                : isHovered ? "rgba(255,255,255,0.6)"
                : "rgba(255,255,255,0.08)"
              }
              strokeWidth={
                isHighlighted ? 1.5
                : isHovered ? 1.2
                : 0.5
              }
              style={{
                cursor: isEU ? "pointer" : "default",
                transition: "fill 0.2s, stroke 0.15s",
                filter: isHighlighted ? `drop-shadow(0 0 4px rgba(0,212,255,0.5))` : undefined,
              }}
              onMouseEnter={(e) => {
                if (!isEU) return;
                setHovered(code);
                const rect = svgRef.current?.getBoundingClientRect();
                if (rect) {
                  setTooltipPos({
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top - 40,
                  });
                }
              }}
              onMouseMove={(e) => {
                const rect = svgRef.current?.getBoundingClientRect();
                if (rect) {
                  setTooltipPos({
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top - 40,
                  });
                }
              }}
              onMouseLeave={() => setHovered(null)}
              onClick={() => {
                if (!isEU) return;
                const label = COUNTRY_LABELS[code] ?? code;
                onCountryClick(code, label, indicator);
              }}
            />
          ))}
        </svg>

        {/* Tooltip */}
        <AnimatePresence>
          {hoveredInfo && hoveredCode && (
            <motion.div
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ duration: 0.1 }}
              className="absolute pointer-events-none z-20 rounded-lg px-3 py-2"
              style={{
                left: Math.min(tooltipPos.x, WIDTH - 160),
                top:  Math.max(tooltipPos.y, 8),
                background: "#0f1117",
                border: "1px solid rgba(255,255,255,0.12)",
                boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
                transform: "translateX(-50%)",
              }}
            >
              <p className="font-mono text-xs font-semibold text-white mb-0.5">
                {hoveredInfo.label}
              </p>
              {hoveredInfo.value !== undefined ? (
                <p className="font-mono text-sm font-bold" style={{ color: "#00d4ff" }}>
                  {hoveredInfo.value.toFixed(2)}{config.unit}
                </p>
              ) : (
                <p className="font-mono text-xs text-white/30">Dato non disponibile</p>
              )}
              <p className="font-mono text-[9px] text-white/25 mt-0.5">
                Clicca per analizzare →
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer hint */}
      <div className="px-5 py-2" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
        <p className="font-mono text-[9px] text-white/20">
          Clicca su un paese EU per avviare l'analisi · Hover per vedere il valore attuale
        </p>
      </div>
    </div>
  );
});

EuroMap.displayName = "EuroMap";
