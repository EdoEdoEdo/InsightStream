"use client";

/**
 * @file app/components/chat/HeroMetrics.tsx
 * @description Top-of-page KPI cards — fetches latest values for 4 key
 * Italian indicators on mount and displays them with delta coloring.
 */

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { C } from "@/app/lib/design-tokens";

// ─── Types ────────────────────────────────────────────────────────────────────

interface HeroMetric {
  label:   string;
  value:   string;
  delta:   string;
  isGood:  boolean | null;
  period:  string;
}

const HERO_INDICATORS = [
  { indicator: "inflation",             label: "Inflazione IT",         higherIsBad: true  },
  { indicator: "unemployment",          label: "Disoccupazione IT",     higherIsBad: true  },
  { indicator: "gdp_growth",            label: "Crescita PIL IT",       higherIsBad: false },
  { indicator: "industrial_production", label: "Produzione Industriale", higherIsBad: false },
] as const;

// ─── Component ────────────────────────────────────────────────────────────────

export function HeroMetrics() {
  const [metrics, setMetrics] = useState<(HeroMetric | null)[]>([null, null, null, null]);

  useEffect(() => {
    HERO_INDICATORS.forEach(async ({ indicator, label, higherIsBad }, idx) => {
      try {
        const res = await fetch(
          `/api/eurostat?indicator=${indicator}&countries=IT&lastTimePeriod=2`,
        );
        if (!res.ok) return;
        const data = await res.json();
        const records: Array<{ value: number; period: string }> = data.records ?? [];
        if (records.length < 1) return;

        const sorted = [...records].sort((a, b) => b.period.localeCompare(a.period));
        const last = sorted[0];
        const prev = sorted[1];
        const delta = prev ? last.value - prev.value : null;
        const unit  = indicator === "industrial_production" ? "" : "%";

        let isGood: boolean | null = null;
        if (delta !== null && delta !== 0) {
          isGood = higherIsBad ? delta < 0 : delta > 0;
        }

        setMetrics((prev) => {
          const next = [...prev];
          next[idx] = {
            label,
            value:  `${last.value.toFixed(indicator === "gdp_growth" ? 2 : 1)}${unit}`,
            delta:  delta !== null
              ? `${delta > 0 ? "+" : ""}${delta.toFixed(2)}${unit}`
              : "—",
            isGood,
            period: last.period,
          };
          return next;
        });
      } catch {
        /* silent fail — card stays as skeleton */
      }
    });
  }, []);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4">
      {metrics.map((m, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: m ? 1 : 0.3, y: 0 }}
          transition={{ duration: 0.4, delay: i * 0.08 }}
          className="rounded-xl px-3 py-2.5 sm:px-4 sm:py-3"
          style={{ background: C.surface, border: `1px solid ${C.border}` }}
        >
          <p
            className="font-mono text-[9px] uppercase tracking-widest mb-1.5 truncate"
            style={{ color: C.neutral }}
          >
            {HERO_INDICATORS[i].label}
          </p>
          {m ? (
            <>
              <p
                className="font-mono text-lg sm:text-xl font-semibold tabular-nums"
                style={{ color: C.cyan }}
              >
                {m.value}
              </p>
              <p
                className="font-mono text-[10px] mt-1 tabular-nums whitespace-nowrap"
                style={{
                  color: m.isGood === null ? C.neutral : m.isGood ? C.good : C.bad,
                }}
              >
                {m.delta}
                <span className="ml-1 opacity-40 text-[9px]">{m.period}</span>
              </p>
            </>
          ) : (
            <div
              className="h-8 rounded animate-pulse"
              style={{ background: "rgba(255,255,255,0.05)" }}
            />
          )}
        </motion.div>
      ))}
    </div>
  );
}
