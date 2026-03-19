"use client";

/**
 * @file app/page.tsx
 * @description InsightStream — Eurostat Economic Intelligence Dashboard.
 */

import { useChat } from "@ai-sdk/react";
import type { Message } from "@ai-sdk/react";
import { useState, useRef, useEffect, useCallback, memo, useMemo, useDeferredValue, startTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  EuroChartSkeleton,
  EuroChartErrorBoundary,
} from "@/app/components/ai/EurostatChart";
import { EconomicChart } from "@/app/components/ai/EconomicChart";
import type { EurostatResult } from "@/app/utils/eurostat-client";
import { SuggestionChips, parseSuggestions } from "@/app/components/ui/SuggestionChips";
import { InfoPanel } from "@/app/components/ui/InfoPanel";
import { EuroMap } from "@/app/components/ai/EuroMap";
import type { EuroIndicator } from "@/app/utils/eurostat-client";
import { DEFAULT_MODEL, MODELS, type ModelId } from "@/app/utils/models";


// ─── Hero Metrics ─────────────────────────────────────────────────────────────

interface HeroMetric {
  label:   string;
  value:   string;
  delta:   string;
  isGood:  boolean | null; // null = neutral
  period:  string;
}

const HERO_INDICATORS = [
  { indicator: "inflation",           label: "Inflazione IT",       higherIsBad: true  },
  { indicator: "unemployment",        label: "Disoccupazione IT",   higherIsBad: true  },
  { indicator: "gdp_growth",          label: "Crescita PIL IT",     higherIsBad: false },
  { indicator: "industrial_production", label: "Produzione Industriale", higherIsBad: false },
] as const;

function HeroMetrics() {
  const [metrics, setMetrics] = useState<(HeroMetric | null)[]>([null, null, null, null]);

  useEffect(() => {
    HERO_INDICATORS.forEach(async ({ indicator, label, higherIsBad }, idx) => {
      try {
        const res = await fetch(`/api/eurostat?indicator=${indicator}&countries=IT&lastTimePeriod=2`);
        if (!res.ok) return;
        const data = await res.json();
        const records: Array<{ value: number; period: string }> = data.records ?? [];
        if (records.length < 1) return;

        const sorted = [...records].sort((a, b) => b.period.localeCompare(a.period));
        const last = sorted[0];
        const prev = sorted[1];
        const delta = prev ? last.value - prev.value : null;
        const unit  = indicator === "gdp_growth" ? "%" :
                      indicator === "industrial_production" ? "" : "%";

        let isGood: boolean | null = null;
        if (delta !== null && delta !== 0) {
          isGood = higherIsBad ? delta < 0 : delta > 0;
        }

        setMetrics(prev => {
          const next = [...prev];
          next[idx] = {
            label,
            value:  `${last.value.toFixed(indicator === "gdp_growth" ? 2 : 1)}${unit}`,
            delta:  delta !== null ? `${delta > 0 ? "+" : ""}${delta.toFixed(2)}${unit}` : "—",
            isGood,
            period: last.period,
          };
          return next;
        });
      } catch { /* silent fail */ }
    });
  }, []);

  const goodColor    = "#22d3a5";
  const badColor     = "#ff4d6d";
  const neutralColor = "rgba(255,255,255,0.3)";

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
          <p className="font-mono text-[9px] uppercase tracking-widest mb-1.5 truncate"
            style={{ color: "rgba(255,255,255,0.3)" }}>
            {HERO_INDICATORS[i].label}
          </p>
          {m ? (
            <>
              <p className="font-mono text-lg sm:text-xl font-semibold tabular-nums"
                style={{ color: C.cyan }}>
                {m.value}
              </p>
              <p className="font-mono text-[10px] mt-1 tabular-nums whitespace-nowrap"
                style={{ color: m.isGood === null ? neutralColor : m.isGood ? goodColor : badColor }}>
                {m.delta}
                <span className="ml-1 opacity-40 text-[9px]">{m.period}</span>
              </p>
            </>
          ) : (
            <div className="h-8 rounded animate-pulse" style={{ background: "rgba(255,255,255,0.05)" }} />
          )}
        </motion.div>
      ))}
    </div>
  );
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  bg:      "#07080d",
  surface: "#0a0c12",
  border:  "rgba(255,255,255,0.08)",
  cyan:    "#00d4ff",
  amber:   "#ff8c42",
  muted:   "rgba(255,255,255,0.35)",
} as const;

// ─── Suggested prompts ────────────────────────────────────────────────────────

const SUGGESTED_PROMPTS = [
  { label: "Inflazione IT vs EU",    prompt: "Confronta l'inflazione di Italia e media EU27 negli ultimi 24 mesi" },
  { label: "Disoccupazione EU",      prompt: "Mostrami disoccupazione di Italia, Germania e Spagna" },
  { label: "NEET giovani",           prompt: "Confronta i giovani NEET in Italia, Spagna e media EU27" },
  { label: "Debito pubblico",        prompt: "Analizza il debito pubblico di Italia, Francia e Germania" },
  { label: "Prezzi immobili",        prompt: "Come sono cambiati i prezzi degli immobili in Italia?" },
  { label: "Fiducia consumatori",    prompt: "Mostrami la fiducia dei consumatori italiani vs media europea" },
  { label: "Energia rinnovabile",    prompt: "Quota rinnovabili: Italia vs Germania e Spagna" },
  { label: "Quadro macro Italia",    prompt: "Dammi un quadro completo: inflazione, disoccupazione e PIL italiano" },
] as const;

// ─── Tool block ───────────────────────────────────────────────────────────────

interface ToolBlockProps {
  toolName: string;
  state:    "partial-call" | "call" | "result";
  result:   unknown;
}

const ToolBlock = memo(function ToolBlock({ toolName, state, result }: ToolBlockProps) {
  const isLoading = state === "partial-call" || state === "call";

  if (toolName !== "getEurostatData") return null;

  return (
    <div className="my-3">
      <EuroChartErrorBoundary>
        <AnimatePresence mode="wait">
          {isLoading ? (
            <EuroChartSkeleton key="skeleton" />
          ) : (
            <EconomicChart key="chart" result={result as EurostatResult} />
          )}
        </AnimatePresence>
      </EuroChartErrorBoundary>
    </div>
  );
});

ToolBlock.displayName = "ToolBlock";

// ─── Message bubble ───────────────────────────────────────────────────────────

// Separate component for assistant message content — allows proper hook usage
function AssistantContent({ content, onSuggest, isLoading, showSuggestions }: {
  content: string;
  onSuggest: (p: string) => void;
  isLoading: boolean;
  showSuggestions: boolean;
}) {
  // Only parse suggestions when streaming is complete.
  // During streaming, rawRegex can match partial JSON and trigger
  // state updates during render (React error #185).
  // Always parse to get clean text (removes suggestions block from display).
  // Chips are gated separately by showSuggestions — no need to skip here.
  const { cleanText, suggestions } = useMemo(
    () => parseSuggestions(content),
    [content]
  );

  return (
    <>
      <div
        className="rounded-xl px-4 py-3 text-sm leading-relaxed"
        style={{
          background: C.surface,
          border: `1px solid ${C.border}`,
          color: "rgba(255,255,255,0.75)",
        }}
      >
        {cleanText.split("\n").map((line, i) => {
          if (!line.trim()) return null;

          // Detect section labels: **Dato**, **Contesto**, **Tendenza**
          const datoMatch   = line.match(/^\*\*Dato\*\*\s*:?\s*(.*)/i);
          const contestoMatch = line.match(/^\*\*Contesto\*\*\s*:?\s*(.*)/i);
          const tendenzaMatch = line.match(/^\*\*Tendenza\*\*\s*:?\s*(.*)/i);

          if (datoMatch) {
            return (
              <div key={i} className={i > 0 ? "mt-3" : ""}>
                <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold tracking-widest uppercase px-2 py-0.5 rounded-md mr-2"
                  style={{ background: "rgba(0,200,200,0.12)", color: "#00c8c8", border: "0.5px solid rgba(0,200,200,0.25)" }}>
                  DATO
                </span>
                <span style={{ color: "rgba(255,255,255,0.9)" }}>{datoMatch[1]}</span>
              </div>
            );
          }

          if (contestoMatch) {
            return (
              <div key={i} className={i > 0 ? "mt-3" : ""}>
                <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold tracking-widest uppercase px-2 py-0.5 rounded-md mr-2"
                  style={{ background: "rgba(148,163,184,0.1)", color: "#94a3b8", border: "0.5px solid rgba(148,163,184,0.2)" }}>
                  CONTESTO
                </span>
                <span>{contestoMatch[1]}</span>
              </div>
            );
          }

          if (tendenzaMatch) {
            const restText = tendenzaMatch[1];
            return (
              <div key={i} className={i > 0 ? "mt-3" : ""}>
                <span className="inline-flex items-center font-mono text-[10px] font-semibold tracking-widest uppercase px-2 py-0.5 rounded-md mr-2"
                  style={{ background: "rgba(148,163,184,0.1)", color: "#94a3b8", border: "0.5px solid rgba(148,163,184,0.2)" }}>
                  TENDENZA
                </span>
                {restText && (
                  <span style={{ color: "rgba(255,255,255,0.75)" }}>
                    {restText.split(/(\*\*[^*]+\*\*)/).map((seg, j) =>
                      seg.startsWith("**") && seg.endsWith("**") ? (
                        <strong key={j} className="font-semibold text-white/90">{seg.slice(2,-2)}</strong>
                      ) : <span key={j}>{seg}</span>
                    )}
                  </span>
                )}
              </div>
            );
          }

          // Bullet lines with Positiva/Negativa/Stabile after a **Tendenza** header
          const bulletTendenzaMatch = line.match(/^-\s+\*{0,2}([^*:]+?)\*{0,2}\s*:\s*\*{0,2}(Positiv[ao]|Negativ[ao]|Stabil[ei])\*{0,2}(.*)/i);
          if (bulletTendenzaMatch) {
            const country = bulletTendenzaMatch[1];
            const tendency = bulletTendenzaMatch[2].toLowerCase();
            const rest = bulletTendenzaMatch[3];
            const isPos = tendency.startsWith("positiv");
            const isNeg = tendency.startsWith("negativ");
            const color = isPos ? "#4ade80" : isNeg ? "#f87171" : "#94a3b8";
            return (
              <p key={i} className={i > 0 ? "mt-1" : ""}>
                <span className="text-white/50 mr-1">—</span>
                <strong className="text-white/90">{country}</strong>
                <span className="mx-1.5 text-white/30">·</span>
                <span className="font-semibold" style={{ color }}>
                  {bulletTendenzaMatch[2]}
                </span>
                <span className="text-white/50">{rest}</span>
              </p>
            );
          }

          // Default: render with bold support
          return (
            <p key={i} className={i > 0 ? "mt-1.5" : ""}>
              {line.split(/(\*\*[^*]+\*\*)/).map((seg, j) =>
                seg.startsWith("**") && seg.endsWith("**") ? (
                  <strong key={j} className="font-semibold text-white/90">
                    {seg.slice(2, -2)}
                  </strong>
                ) : (
                  <span key={j}>{seg}</span>
                )
              )}
            </p>
          );
        })}
      </div>
      {showSuggestions && suggestions.length > 0 && (
        <SuggestionChips
          suggestions={suggestions}
          onSelect={onSuggest}
          isLoading={isLoading}
        />
      )}
    </>
  );
}

const MessageBubble = memo(function MessageBubble({ message, onSuggest, isLoading, isLast }: { message: Message; onSuggest: (p: string) => void; isLoading: boolean; isLast: boolean }) {
  const isUser = message.role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div className={`max-w-[82%] ${isUser ? "order-1" : ""}`}>
        <p
          className="font-mono text-[9px] uppercase tracking-widest mb-1.5 px-1"
          style={{ color: isUser ? C.amber : C.muted }}
        >
          {isUser ? "Tu" : "InsightStream AI"}
        </p>

        {!isUser && message.toolInvocations?.map((tool) => (
          <ToolBlock
            key={tool.toolCallId}
            toolName={tool.toolName}
            state={tool.state}
            result={"result" in tool ? tool.result : undefined}
          />
        ))}

        {message.content && (
          isUser ? (
            <div
              className="rounded-xl px-4 py-3 text-sm leading-relaxed"
              style={{
                background: `linear-gradient(135deg, ${C.amber}18, ${C.amber}08)`,
                border: `1px solid ${C.amber}25`,
                color: "rgba(255,255,255,0.9)",
              }}
            >
              {message.content.split("\n").map((line, i) =>
                line.trim() ? <p key={i} className={i > 0 ? "mt-2" : ""}>{line}</p> : null
              )}
            </div>
          ) : (
            <AssistantContent
              content={message.content}
              onSuggest={onSuggest}
              isLoading={isLoading}
              showSuggestions={isLast}
            />
          )
        )}
      </div>
    </motion.div>
  );
});

MessageBubble.displayName = "MessageBubble";

// ─── Main page ────────────────────────────────────────────────────────────────

export default function InsightStreamPage() {
  // selectedModel must be declared before useChat (used in body option).
  // Initialize with DEFAULT_MODEL always (avoids SSR/client hydration mismatch).
  // Read localStorage in useEffect after hydration to restore persisted choice.
  const [selectedModel, setSelectedModel] = useState<ModelId>(DEFAULT_MODEL);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingSlide, setOnboardingSlide] = useState(0);

  useEffect(() => {
    const saved = localStorage.getItem("insightstream_model") as ModelId | null;
    if (saved && saved in MODELS) setSelectedModel(saved);
  }, []);




  const handleModelChange = useCallback((id: ModelId) => {
    setSelectedModel(id);
    localStorage.setItem("insightstream_model", id);
  }, []);


  // Show onboarding on first visit per session
  useEffect(() => {
    const seen = sessionStorage.getItem("insightstream_onboarding");
    if (!seen) setShowOnboarding(true);
  }, []);


  const { messages, input, handleInputChange, handleSubmit, isLoading, error, setMessages } =
    useChat({
      api: "/api/chat",
      body: { modelId: selectedModel },
      // Throttle streaming updates to prevent React error #185
      // (Cannot update a component while rendering a different component)
      // 50ms batches rapid token updates into stable render cycles
      experimental_throttle: 50,
      onError: (err) => console.error("[InsightStream] Chat error:", err),
    });

  // ── Reset state ──
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [infoPanelOpen, setInfoPanelOpen] = useState(false);

  // ── Map state ──
  const [mapOpen, setMapOpen]           = useState(false);
  const [mapIndicator, setMapIndicator] = useState<EuroIndicator>("inflation");
  const [highlightedCountries, setHighlightedCountries] = useState<string[]>([]);

  // Extract countries mentioned in last AI message for map highlighting
  useEffect(() => {
    const lastAI = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAI?.toolInvocations) return;
    const codes: string[] = [];
    for (const inv of lastAI.toolInvocations) {
      if (inv.toolName === "getEurostatData" && "result" in inv) {
        const r = inv.result as { countries?: string[] };
        if (r?.countries) codes.push(...r.countries.filter((c) => c.length === 2));
      }
    }
    setHighlightedCountries([...new Set(codes)]);
  }, [messages]);

  const handleMapCountryClick = useCallback(
    (code: string, label: string, indicator: EuroIndicator) => {
      const indicatorLabel = indicator.replace(/_/g, " ");
      const prompt = `Analizza ${indicatorLabel} per ${label} (${code}) negli ultimi 24 mesi`;
      handleInputChange({ target: { value: prompt } } as React.ChangeEvent<HTMLTextAreaElement>);
      setTimeout(() => {
        const form = document.querySelector("form");
        form?.requestSubmit();
      }, 50);
    },
    [handleInputChange]
  );

  const closeOnboarding = useCallback((query?: string) => {
    sessionStorage.setItem("insightstream_onboarding", "1");
    setShowOnboarding(false);
    setOnboardingSlide(0);
    if (query) {
      setTimeout(() => {
        handleInputChange({ target: { value: query } } as React.ChangeEvent<HTMLTextAreaElement>);
        setTimeout(() => {
          const form = document.querySelector("form");
          form?.requestSubmit();
        }, 100);
      }, 300);
    }
  }, [handleInputChange]);

  const handleReset = useCallback(() => {
    setMessages([]);
    setShowResetConfirm(false);
  }, [setMessages]);

  const [inputFocused, setInputFocused] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef       = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (input.trim() && !isLoading) handleSubmit(e as unknown as React.FormEvent);
      }
    },
    [input, isLoading, handleSubmit]
  );

  const handleSuggestedPrompt = useCallback(
    (prompt: string) => {
      handleInputChange({ target: { value: prompt } } as React.ChangeEvent<HTMLTextAreaElement>);
      inputRef.current?.focus();
    },
    [handleInputChange]
  );

  // useDeferredValue lets React skip re-renders of the message list
  // during rapid streaming token updates — eliminates React #185
  const deferredMessages = useDeferredValue(messages);
  const isEmpty = deferredMessages.length === 0;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: C.bg, fontFamily: "'DM Mono', monospace" }}>

      {/* Noise texture */}
      <div className="pointer-events-none fixed inset-0 opacity-[0.025]"
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")` }}
      />

      {/* Header */}
      <header className="sticky top-0 z-50 flex items-center justify-between px-3 sm:px-6 h-14"
        style={{ background: `${C.bg}e0`, backdropFilter: "blur(12px)", borderBottom: `1px solid ${C.border}` }}>
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-7 h-7 rounded-md flex items-center justify-center"
            style={{ background: `linear-gradient(135deg, ${C.cyan}30, ${C.cyan}10)`, border: `1px solid ${C.cyan}40` }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="1" y="7" width="2" height="6" fill={C.cyan} opacity="0.9" />
              <rect x="5" y="4" width="2" height="9" fill={C.cyan} opacity="0.7" />
              <rect x="9" y="1" width="2" height="12" fill={C.cyan} opacity="0.5" />
              <path d="M1 5 L6 3 L10 1" stroke={C.amber} strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <span className="text-sm font-semibold tracking-tight text-white" style={{ fontFamily: "'Syne', sans-serif" }}>
              InsightStream
            </span>
            <span className="ml-2 font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded-sm hidden sm:inline"
              style={{ color: C.cyan, background: `${C.cyan}15`, border: `1px solid ${C.cyan}25` }}>
              Eurostat Live
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full"
              style={{ background: isLoading ? C.amber : C.cyan, boxShadow: `0 0 6px ${isLoading ? C.amber : C.cyan}` }} />
            <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: C.muted }}>
              {isLoading ? "Analisi in corso" : "Pronto"}
            </span>
          </div>

          {/* Map toggle button */}
          <button
            onClick={() => setMapOpen((v) => !v)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 sm:gap-1.5 sm:px-3 rounded-lg transition-all duration-200"
            style={{
              background: mapOpen ? "rgba(0,212,255,0.1)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${mapOpen ? "rgba(0,212,255,0.3)" : "rgba(255,255,255,0.08)"}`,
              color: mapOpen ? "#00d4ff" : "rgba(255,255,255,0.4)",
              fontFamily: "'DM Mono', monospace",
              fontSize: "10px",
              letterSpacing: "0.04em",
            }}
            onMouseEnter={(e) => {
              if (mapOpen) return;
              (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(0,212,255,0.3)";
              (e.currentTarget as HTMLButtonElement).style.color = "#00d4ff";
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,212,255,0.06)";
            }}
            onMouseLeave={(e) => {
              if (mapOpen) return;
              (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.08)";
              (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.4)";
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)";
            }}
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <path d="M1 3l3.5 1.5L8 2l2 1v5.5L8 7.5 4.5 9 1 7.5V3z"
                stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
              <path d="M4.5 9V4.5M8 7.5V2" stroke="currentColor" strokeWidth="1.2"/>
            </svg>
            <span className="hidden sm:inline">Mappa</span>
          </button>

          {/* Info / About button */}
          <button
            onClick={() => setInfoPanelOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 sm:gap-1.5 sm:px-3 rounded-lg transition-all duration-200"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "rgba(255,255,255,0.4)",
              fontFamily: "'DM Mono', monospace",
              fontSize: "10px",
              letterSpacing: "0.04em",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(0,212,255,0.3)";
              (e.currentTarget as HTMLButtonElement).style.color = "#00d4ff";
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,212,255,0.06)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.08)";
              (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.4)";
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)";
            }}
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <circle cx="5.5" cy="5.5" r="4.5" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M5.5 5v3M5.5 3.5v.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            <span className="hidden sm:inline">Info</span>
          </button>

          {/* Reset button — only visible when there are messages */}
          <AnimatePresence>
            {messages.length > 0 && (
              <motion.button
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                transition={{ duration: 0.15 }}
                onClick={() => setShowResetConfirm(true)}
                disabled={isLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all duration-200 disabled:opacity-30"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "rgba(255,255,255,0.4)",
                  fontFamily: "'DM Mono', monospace",
                  fontSize: "10px",
                  letterSpacing: "0.04em",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,75,110,0.4)";
                  (e.currentTarget as HTMLButtonElement).style.color = "#ff4d6d";
                  (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,75,110,0.06)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.08)";
                  (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.4)";
                  (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)";
                }}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <span className="hidden sm:inline">Nuova analisi</span>
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </header>

      {/* ── Reset confirm modal ── */}
      <AnimatePresence>
        {showResetConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[100] flex items-center justify-center px-4"
            style={{ background: "rgba(7,8,13,0.85)", backdropFilter: "blur(8px)" }}
            onClick={() => setShowResetConfirm(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="rounded-xl p-6 w-full max-w-sm"
              style={{ background: "#0e1018", border: "1px solid rgba(255,255,255,0.1)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <p className="font-mono text-[10px] uppercase tracking-widest mb-3" style={{ color: "#ff4d6d" }}>
                Nuova analisi
              </p>
              <p className="text-sm text-white/70 leading-relaxed mb-6">
                La conversazione corrente verrà cancellata e tornerai alla home. Vuoi continuare?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowResetConfirm(false)}
                  className="flex-1 py-2 rounded-lg text-xs font-mono transition-all duration-150"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" }}
                >
                  Annulla
                </button>
                <button
                  onClick={handleReset}
                  className="flex-1 py-2 rounded-lg text-xs font-mono transition-all duration-150"
                  style={{ background: "rgba(255,75,110,0.15)", border: "1px solid rgba(255,75,110,0.3)", color: "#ff4d6d" }}
                >
                  Ricomincia
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hero Metrics — always visible, above map */}
      <div className="max-w-3xl w-full mx-auto px-4 pt-4 pb-2">
        <HeroMetrics />
      </div>

      {/* ── Collapsible Map Panel ── */}
      <AnimatePresence>
        {mapOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: "hidden", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
          >
            <div className="max-w-3xl mx-auto px-4 py-4">
              <EuroMap
                indicator={mapIndicator}
                onIndicatorChange={setMapIndicator}
                onCountryClick={handleMapCountryClick}
                highlightedCountries={highlightedCountries}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main */}
      <main className="flex-1 flex flex-col max-w-3xl w-full mx-auto px-4 pb-36">

        {/* Hero */}
        <AnimatePresence>
          {isEmpty && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col items-center justify-center flex-1 py-20 text-center"
            >
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-8"
                style={{ background: `radial-gradient(circle at 40% 40%, ${C.cyan}20, transparent)`, border: `1px solid ${C.cyan}20`, boxShadow: `0 0 60px ${C.cyan}10` }}>
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                  <rect x="2"  y="14" width="4" height="12" fill={C.cyan} opacity="0.9" rx="1" />
                  <rect x="10" y="8"  width="4" height="18" fill={C.cyan} opacity="0.7" rx="1" />
                  <rect x="18" y="2"  width="4" height="24" fill={C.cyan} opacity="0.5" rx="1" />
                  <path d="M2 10 L12 6 L20 2" stroke={C.amber} strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>

              <h1 className="text-3xl font-bold text-white tracking-tight mb-2"
                style={{ fontFamily: "'Syne', sans-serif" }}>
                InsightStream
              </h1>
              <p className="font-mono text-xs mb-1" style={{ color: C.cyan }}>
                European Economic Intelligence
              </p>
              <p className="text-sm max-w-sm leading-relaxed mt-2" style={{ color: C.muted }}>
                Analisi economica europea in linguaggio naturale.
                Dati live Eurostat — inflazione, lavoro, energia, immobili e molto altro.
              </p>

              <div className="grid grid-cols-2 gap-2 mt-10 w-full max-w-lg">
                {SUGGESTED_PROMPTS.map(({ label, prompt }) => (
                  <button
                    key={label}
                    onClick={() => handleSuggestedPrompt(prompt)}
                    className="rounded-lg px-4 py-3 text-left transition-all duration-200 text-xs"
                    style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.muted }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor = `${C.cyan}35`;
                      (e.currentTarget as HTMLButtonElement).style.color = "#fff";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor = C.border;
                      (e.currentTarget as HTMLButtonElement).style.color = C.muted;
                    }}
                  >
                    <span className="block font-mono text-[9px] uppercase tracking-widest mb-1" style={{ color: C.cyan }}>→</span>
                    {label}
                  </button>
                ))}
              </div>

              {/* Data source badge */}
              <div className="mt-8 flex items-center gap-2 px-3 py-1.5 rounded-full"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="w-1 h-1 rounded-full bg-green-400" />
                <span className="font-mono text-[9px] text-white/30 uppercase tracking-widest">
                  Fonte: Eurostat · Aggiornamento 2× al giorno
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Messages */}
        {!isEmpty && (
          <div className="flex-1 py-8 space-y-6">
            {deferredMessages.map((message, index) => (
              <MessageBubble
                key={message.id}
                message={message}
                onSuggest={(prompt) => {
                  if (isLoading) return; // prevent submitting while stream is active
                  handleInputChange({ target: { value: prompt } } as React.ChangeEvent<HTMLTextAreaElement>);
                  setTimeout(() => {
                    const form = document.querySelector("form");
                    form?.requestSubmit();
                  }, 100);
                }}
                isLoading={isLoading}
                isLast={index === deferredMessages.length - 1}
              />
            ))}

            {isLoading && deferredMessages[deferredMessages.length - 1]?.role !== "assistant" && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-1.5 px-1 items-center">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="w-1 h-1 rounded-full"
                    style={{ background: C.cyan, animation: `bounce 1.2s ease-in-out ${i * 0.15}s infinite` }} />
                ))}
              </motion.div>
            )}

            {error && (
              <motion.div
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-red-500/20 bg-red-950/20 px-5 py-4"
              >
                <p className="font-mono text-[10px] text-red-400/60 uppercase tracking-widest mb-1">Errore</p>
                <p className="text-sm text-white/50">{error.message}</p>
              </motion.div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </main>

      {/* Input bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50"
        style={{ background: `linear-gradient(to top, ${C.bg} 60%, transparent)`, paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="max-w-3xl mx-auto px-4 pb-6 pt-8">
          <form onSubmit={handleSubmit}>
            <div
              className="flex items-end gap-3 rounded-xl px-4 py-3 transition-all duration-200"
              style={{
                background: C.surface,
                border: `1px solid ${inputFocused ? `${C.cyan}35` : C.border}`,
                boxShadow: inputFocused ? `0 0 0 3px ${C.cyan}08, 0 8px 32px rgba(0,0,0,0.4)` : "0 8px 32px rgba(0,0,0,0.3)",
              }}
            >
              <textarea
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                placeholder="Es: Confronta inflazione e disoccupazione di Italia e Germania…"
                rows={1}
                disabled={isLoading}
                className="flex-1 bg-transparent resize-none outline-none text-sm text-white/85 placeholder:text-white/20 font-mono leading-relaxed disabled:opacity-50"
                style={{ minHeight: "24px", maxHeight: "120px" }}
                onInput={(e) => {
                  const el = e.currentTarget;
                  el.style.height = "auto";
                  el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
                }}
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 disabled:opacity-30"
                style={{
                  background: input.trim() && !isLoading ? `linear-gradient(135deg, ${C.cyan}30, ${C.cyan}15)` : "transparent",
                  border: `1px solid ${input.trim() && !isLoading ? `${C.cyan}40` : C.border}`,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M7 12V2M2 7l5-5 5 5" stroke={input.trim() && !isLoading ? C.cyan : C.muted}
                    strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
            <p className="font-mono text-[9px] text-center mt-2.5 tracking-widest" style={{ color: "rgba(255,255,255,0.18)" }}>
              ENTER per inviare · SHIFT+ENTER per andare a capo
            </p>
          </form>
        </div>
      </div>

      {/* Info Panel */}
      <InfoPanel
        isOpen={infoPanelOpen}
        onClose={() => setInfoPanelOpen(false)}
        selectedModel={selectedModel}
        onModelChange={handleModelChange}
      />

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@600;700&display=swap');
        @keyframes bounce { 0%, 80%, 100% { transform: translateY(0); opacity: 0.4; } 40% { transform: translateY(-4px); opacity: 1; } }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 9999px; }
      `}</style>

      {/* ── Onboarding Modal ── */}
      <AnimatePresence>
        {showOnboarding && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(7,8,13,0.92)", backdropFilter: "blur(12px)" }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="relative w-full max-w-lg rounded-2xl overflow-hidden"
              style={{ background: "#0a0c12", border: "1px solid rgba(255,255,255,0.1)" }}
            >
              {/* Progress dots */}
              <div className="flex items-center justify-between px-6 pt-5 pb-0">
                <div className="flex gap-1.5">
                  {[0,1,2,3].map(i => (
                    <div key={i} className="rounded-full transition-all duration-300"
                      style={{
                        width: i === onboardingSlide ? "20px" : "6px",
                        height: "6px",
                        background: i === onboardingSlide ? "#00d4ff" : "rgba(255,255,255,0.15)"
                      }} />
                  ))}
                </div>
                <button onClick={() => closeOnboarding()}
                  className="font-mono text-[11px] uppercase tracking-widest transition-colors"
                  style={{ color: "rgba(255,255,255,0.25)" }}
                  onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.5)")}
                  onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.25)")}>
                  Skip
                </button>
              </div>

              {/* Slides */}
              <div className="px-6 py-6" style={{ minHeight: "340px" }}>
                <AnimatePresence mode="wait">

                  {/* Slide 0 — Prodotto */}
                  {onboardingSlide === 0 && (
                    <motion.div key="s0"
                      initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.25 }}>
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{ background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.2)" }}>
                          <svg width="20" height="20" viewBox="0 0 28 28" fill="none">
                            <rect x="2" y="14" width="4" height="12" fill="#00d4ff" opacity="0.9" rx="1"/>
                            <rect x="10" y="8" width="4" height="18" fill="#00d4ff" opacity="0.7" rx="1"/>
                            <rect x="18" y="2" width="4" height="24" fill="#00d4ff" opacity="0.5" rx="1"/>
                            <path d="M2 10 L12 6 L20 2" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round"/>
                          </svg>
                        </div>
                        <div>
                          <h2 className="font-semibold text-lg" style={{ color: "rgba(255,255,255,0.95)", fontFamily: "'Syne', sans-serif" }}>InsightStream</h2>
                          <p className="font-mono text-[11px]" style={{ color: "#00d4ff" }}>European Economic Intelligence</p>
                        </div>
                      </div>
                      <p className="text-sm leading-relaxed mb-4" style={{ color: "rgba(255,255,255,0.55)" }}>
                        Fai una domanda in italiano sull'economia europea. L'AI recupera dati live da Eurostat, genera grafici interattivi e analizza trend — tutto in tempo reale, zero dati inventati.
                      </p>
                      <div className="space-y-2">
                        {[
                          ["💬  Chat in linguaggio naturale", "Nessun filtro da configurare — scrivi come parleresti a un analista"],
                          ["📊  Grafici generativi", "Ogni risposta produce un grafico interattivo con dati reali Eurostat"],
                          ["🤖  AI agentica", "Il modello chiama autonomamente le API — non inventa mai i numeri"],
                          ["🔄  Multi-modello", "Scegli tra Groq, Mistral AI e Google Gemini dall'icona ⓘ"],
                        ].map(([title, desc]) => (
                          <div key={String(title)} className="flex items-start gap-3 rounded-lg px-3 py-2.5"
                            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                            <div>
                              <p className="font-mono text-[11px] font-semibold mb-0.5" style={{ color: "rgba(255,255,255,0.85)" }}>{title}</p>
                              <p className="font-mono text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>{desc}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {/* Slide 1 — Dati */}
                  {onboardingSlide === 1 && (
                    <motion.div key="s1"
                      initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.25 }}>
                      <h2 className="font-semibold text-base mb-1" style={{ color: "rgba(255,255,255,0.95)", fontFamily: "'Syne', sans-serif" }}>
                        Dati & Mappa EU
                      </h2>
                      <p className="font-mono text-[11px] mb-4" style={{ color: "rgba(255,255,255,0.35)" }}>
                        Fonte: Eurostat · Aggiornamento 2× al giorno · Copertura 27 paesi EU
                      </p>
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        {[
                          ["Inflazione HICP","% annua prezzi consumo","mensile"],
                          ["Disoccupazione","% forza lavoro","mensile"],
                          ["Crescita PIL","% variazione reale","trimestrale"],
                          ["Fiducia consumatori","Indice di sentiment","mensile"],
                          ["Prezzi energia","€/kWh famiglie","semestrale"],
                          ["Prezzi immobili","Indice 2015=100","trimestrale"],
                          ["NEET giovani","% under 30","annuale"],
                          ["Rinnovabili","% mix energetico","annuale"],
                          ["Debito pubblico","% del PIL","annuale"],
                          ["Produzione industriale","Indice manifatturiero","mensile"],
                        ].map(([name, desc, freq]) => (
                          <div key={name} className="rounded-lg px-2.5 py-2"
                            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                            <p className="font-mono text-[11px] font-semibold" style={{ color: "rgba(255,255,255,0.8)" }}>{name}</p>
                            <p className="font-mono text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>{desc}</p>
                            <p className="font-mono text-[9px] mt-0.5" style={{ color: "rgba(0,212,255,0.5)" }}>{freq}</p>
                          </div>
                        ))}
                      </div>
                      <div className="rounded-lg px-3 py-2.5 flex items-start gap-3"
                        style={{ background: "rgba(0,212,255,0.05)", border: "1px solid rgba(0,212,255,0.15)" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="mt-0.5 flex-shrink-0">
                          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#00d4ff" opacity="0.7"/>
                        </svg>
                        <div>
                          <p className="font-mono text-[11px] font-semibold mb-0.5" style={{ color: "#00d4ff" }}>Mappa EU Coropleta</p>
                          <p className="font-mono text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                            Visualizza i dati su mappa geografica interattiva. Clicca un paese per analizzarlo direttamente. Attivala dall'icona 🗺 in alto.
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* Slide 2 — Modelli */}
                  {onboardingSlide === 2 && (
                    <motion.div key="s2"
                      initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.25 }}>
                      <h2 className="font-semibold text-base mb-1" style={{ color: "rgba(255,255,255,0.95)", fontFamily: "'Syne', sans-serif" }}>
                        Modelli AI disponibili
                      </h2>
                      <p className="font-mono text-[11px] mb-4" style={{ color: "rgba(255,255,255,0.35)" }}>
                        Tutti gratuiti · Cambia modello in qualsiasi momento dall'icona ⓘ
                      </p>
                      <div className="space-y-2.5 mb-4">
                        {[
                          ["Llama 3.3 70B","Groq","#f97316","Default — migliore qualità analitica e ragionamento multi-indicatore"],
                          ["Llama 3.1 8B","Groq","#f97316","Ultra-veloce — ideale per query semplici e sessioni ad alto volume"],
                          ["Mistral Small","Mistral AI","#8b5cf6","Modello europeo — ottimo multilingual, 1B token/mese gratuiti"],
                          ["Gemini 2.0 Flash","Google AI","#22d3a5","Velocissimo — ottimo supporto tool calling, aggiornato 2025"],
                        ].map(([name, provider, color, desc]) => (
                          <div key={name} className="rounded-lg px-3 py-2.5"
                            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                            <div className="flex items-center gap-2 mb-1">
                              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                              <p className="font-mono text-[12px] font-semibold" style={{ color: "rgba(255,255,255,0.9)" }}>{name}</p>
                              <p className="font-mono text-[10px] ml-auto" style={{ color }}>{provider}</p>
                            </div>
                            <p className="font-mono text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>{desc}</p>
                          </div>
                        ))}
                      </div>
                      <div className="rounded-lg px-3 py-2.5"
                        style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                        <p className="font-mono text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>
                          💡 Se un modello non risponde, cambia provider — ogni servizio ha rate limit indipendenti.
                        </p>
                      </div>
                    </motion.div>
                  )}

                  {/* Slide 3 — Inizia */}
                  {onboardingSlide === 3 && (
                    <motion.div key="s3"
                      initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.25 }}>
                      <h2 className="font-semibold text-base mb-1" style={{ color: "rgba(255,255,255,0.95)", fontFamily: "'Syne', sans-serif" }}>
                        Inizia la tua analisi
                      </h2>
                      <p className="font-mono text-[11px] mb-4" style={{ color: "rgba(255,255,255,0.35)" }}>
                        Clicca un esempio per avviare subito — o scrivi la tua domanda
                      </p>
                      <div className="space-y-2">
                        {[
                          ["Quadro macro Italia","Dammi un quadro macroeconomico completo dell'Italia: inflazione, disoccupazione e crescita PIL"],
                          ["Confronto inflazione","Confronta l'inflazione di Italia, Germania e Spagna negli ultimi 24 mesi"],
                          ["Debito pubblico EU","Analizza il debito pubblico di Italia, Francia e Germania dal 2015"],
                          ["Resilienza economica","Confronta la resilienza economica di Italia e Spagna usando inflazione, disoccupazione e PIL"],
                        ].map(([label, query]) => (
                          <button key={label} onClick={() => closeOnboarding(query)}
                            className="w-full text-left rounded-lg px-4 py-3 transition-all duration-200"
                            style={{ background: "rgba(0,212,255,0.04)", border: "1px solid rgba(0,212,255,0.12)" }}
                            onMouseEnter={e => { e.currentTarget.style.background = "rgba(0,212,255,0.09)"; e.currentTarget.style.borderColor = "rgba(0,212,255,0.3)"; }}
                            onMouseLeave={e => { e.currentTarget.style.background = "rgba(0,212,255,0.04)"; e.currentTarget.style.borderColor = "rgba(0,212,255,0.12)"; }}>
                            <p className="font-mono text-[11px] font-semibold mb-0.5" style={{ color: "#00d4ff" }}>→ {label}</p>
                            <p className="font-mono text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>{query}</p>
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}

                </AnimatePresence>
              </div>

              {/* Footer navigation */}
              <div className="flex items-center justify-between px-6 pb-5">
                <button
                  onClick={() => setOnboardingSlide(s => Math.max(0, s - 1))}
                  className="font-mono text-[11px] uppercase tracking-widest transition-colors"
                  style={{ color: onboardingSlide === 0 ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.4)", cursor: onboardingSlide === 0 ? "default" : "pointer" }}
                  disabled={onboardingSlide === 0}>
                  ← Indietro
                </button>
                {onboardingSlide < 3 ? (
                  <button
                    onClick={() => setOnboardingSlide(s => s + 1)}
                    className="font-mono text-[12px] font-semibold px-5 py-2 rounded-lg transition-all duration-200"
                    style={{ background: "#00d4ff", color: "#07080d" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#00bde8")}
                    onMouseLeave={e => (e.currentTarget.style.background = "#00d4ff")}>
                    Avanti →
                  </button>
                ) : (
                  <button
                    onClick={() => closeOnboarding()}
                    className="font-mono text-[12px] font-semibold px-5 py-2 rounded-lg transition-all duration-200"
                    style={{ background: "#00d4ff", color: "#07080d" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#00bde8")}
                    onMouseLeave={e => (e.currentTarget.style.background = "#00d4ff")}>
                    Inizia →
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Onboarding Modal ── */}
      <AnimatePresence>
        {showOnboarding && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(7,8,13,0.92)", backdropFilter: "blur(12px)" }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="relative w-full max-w-lg rounded-2xl overflow-hidden"
              style={{ background: "#0a0c12", border: "1px solid rgba(255,255,255,0.1)" }}
            >
              {/* Progress dots */}
              <div className="flex items-center justify-between px-6 pt-5 pb-0">
                <div className="flex gap-1.5">
                  {[0,1,2,3].map(i => (
                    <div key={i} className="rounded-full transition-all duration-300"
                      style={{
                        width: i === onboardingSlide ? "20px" : "6px",
                        height: "6px",
                        background: i === onboardingSlide ? "#00d4ff" : "rgba(255,255,255,0.15)"
                      }} />
                  ))}
                </div>
                <button onClick={() => closeOnboarding()}
                  className="font-mono text-[11px] uppercase tracking-widest transition-colors"
                  style={{ color: "rgba(255,255,255,0.25)" }}
                  onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.5)")}
                  onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.25)")}>
                  Skip
                </button>
              </div>

              {/* Slides */}
              <div className="px-6 py-6" style={{ minHeight: "340px" }}>
                <AnimatePresence mode="wait">

                  {/* Slide 0 — Prodotto */}
                  {onboardingSlide === 0 && (
                    <motion.div key="s0"
                      initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.25 }}>
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{ background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.2)" }}>
                          <svg width="20" height="20" viewBox="0 0 28 28" fill="none">
                            <rect x="2" y="14" width="4" height="12" fill="#00d4ff" opacity="0.9" rx="1"/>
                            <rect x="10" y="8" width="4" height="18" fill="#00d4ff" opacity="0.7" rx="1"/>
                            <rect x="18" y="2" width="4" height="24" fill="#00d4ff" opacity="0.5" rx="1"/>
                            <path d="M2 10 L12 6 L20 2" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round"/>
                          </svg>
                        </div>
                        <div>
                          <h2 className="font-semibold text-lg" style={{ color: "rgba(255,255,255,0.95)", fontFamily: "'Syne', sans-serif" }}>InsightStream</h2>
                          <p className="font-mono text-[11px]" style={{ color: "#00d4ff" }}>European Economic Intelligence</p>
                        </div>
                      </div>
                      <p className="text-sm leading-relaxed mb-4" style={{ color: "rgba(255,255,255,0.55)" }}>
                        Fai una domanda in italiano sull'economia europea. L'AI recupera dati live da Eurostat, genera grafici interattivi e analizza trend — tutto in tempo reale, zero dati inventati.
                      </p>
                      <div className="space-y-2">
                        {[
                          ["💬  Chat in linguaggio naturale", "Nessun filtro da configurare — scrivi come parleresti a un analista"],
                          ["📊  Grafici generativi", "Ogni risposta produce un grafico interattivo con dati reali Eurostat"],
                          ["🤖  AI agentica", "Il modello chiama autonomamente le API — non inventa mai i numeri"],
                          ["🔄  Multi-modello", "Scegli tra Groq, Mistral AI e Google Gemini dall'icona ⓘ"],
                        ].map(([title, desc]) => (
                          <div key={String(title)} className="flex items-start gap-3 rounded-lg px-3 py-2.5"
                            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                            <div>
                              <p className="font-mono text-[11px] font-semibold mb-0.5" style={{ color: "rgba(255,255,255,0.85)" }}>{title}</p>
                              <p className="font-mono text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>{desc}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {/* Slide 1 — Dati */}
                  {onboardingSlide === 1 && (
                    <motion.div key="s1"
                      initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.25 }}>
                      <h2 className="font-semibold text-base mb-1" style={{ color: "rgba(255,255,255,0.95)", fontFamily: "'Syne', sans-serif" }}>
                        Dati & Mappa EU
                      </h2>
                      <p className="font-mono text-[11px] mb-4" style={{ color: "rgba(255,255,255,0.35)" }}>
                        Fonte: Eurostat · Aggiornamento 2× al giorno · Copertura 27 paesi EU
                      </p>
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        {[
                          ["Inflazione HICP","% annua prezzi consumo","mensile"],
                          ["Disoccupazione","% forza lavoro","mensile"],
                          ["Crescita PIL","% variazione reale","trimestrale"],
                          ["Fiducia consumatori","Indice di sentiment","mensile"],
                          ["Prezzi energia","€/kWh famiglie","semestrale"],
                          ["Prezzi immobili","Indice 2015=100","trimestrale"],
                          ["NEET giovani","% under 30","annuale"],
                          ["Rinnovabili","% mix energetico","annuale"],
                          ["Debito pubblico","% del PIL","annuale"],
                          ["Produzione industriale","Indice manifatturiero","mensile"],
                        ].map(([name, desc, freq]) => (
                          <div key={name} className="rounded-lg px-2.5 py-2"
                            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                            <p className="font-mono text-[11px] font-semibold" style={{ color: "rgba(255,255,255,0.8)" }}>{name}</p>
                            <p className="font-mono text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>{desc}</p>
                            <p className="font-mono text-[9px] mt-0.5" style={{ color: "rgba(0,212,255,0.5)" }}>{freq}</p>
                          </div>
                        ))}
                      </div>
                      <div className="rounded-lg px-3 py-2.5 flex items-start gap-3"
                        style={{ background: "rgba(0,212,255,0.05)", border: "1px solid rgba(0,212,255,0.15)" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="mt-0.5 flex-shrink-0">
                          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#00d4ff" opacity="0.7"/>
                        </svg>
                        <div>
                          <p className="font-mono text-[11px] font-semibold mb-0.5" style={{ color: "#00d4ff" }}>Mappa EU Coropleta</p>
                          <p className="font-mono text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                            Visualizza i dati su mappa geografica interattiva. Clicca un paese per analizzarlo direttamente. Attivala dall'icona 🗺 in alto.
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* Slide 2 — Modelli */}
                  {onboardingSlide === 2 && (
                    <motion.div key="s2"
                      initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.25 }}>
                      <h2 className="font-semibold text-base mb-1" style={{ color: "rgba(255,255,255,0.95)", fontFamily: "'Syne', sans-serif" }}>
                        Modelli AI disponibili
                      </h2>
                      <p className="font-mono text-[11px] mb-4" style={{ color: "rgba(255,255,255,0.35)" }}>
                        Tutti gratuiti · Cambia modello in qualsiasi momento dall'icona ⓘ
                      </p>
                      <div className="space-y-2.5 mb-4">
                        {[
                          ["Llama 3.3 70B","Groq","#f97316","Default — migliore qualità analitica e ragionamento multi-indicatore"],
                          ["Llama 3.1 8B","Groq","#f97316","Ultra-veloce — ideale per query semplici e sessioni ad alto volume"],
                          ["Mistral Small","Mistral AI","#8b5cf6","Modello europeo — ottimo multilingual, 1B token/mese gratuiti"],
                          ["Gemini 2.0 Flash","Google AI","#22d3a5","Velocissimo — ottimo supporto tool calling, aggiornato 2025"],
                        ].map(([name, provider, color, desc]) => (
                          <div key={name} className="rounded-lg px-3 py-2.5"
                            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                            <div className="flex items-center gap-2 mb-1">
                              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                              <p className="font-mono text-[12px] font-semibold" style={{ color: "rgba(255,255,255,0.9)" }}>{name}</p>
                              <p className="font-mono text-[10px] ml-auto" style={{ color }}>{provider}</p>
                            </div>
                            <p className="font-mono text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>{desc}</p>
                          </div>
                        ))}
                      </div>
                      <div className="rounded-lg px-3 py-2.5"
                        style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                        <p className="font-mono text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>
                          💡 Se un modello non risponde, cambia provider — ogni servizio ha rate limit indipendenti.
                        </p>
                      </div>
                    </motion.div>
                  )}

                  {/* Slide 3 — Inizia */}
                  {onboardingSlide === 3 && (
                    <motion.div key="s3"
                      initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.25 }}>
                      <h2 className="font-semibold text-base mb-1" style={{ color: "rgba(255,255,255,0.95)", fontFamily: "'Syne', sans-serif" }}>
                        Inizia la tua analisi
                      </h2>
                      <p className="font-mono text-[11px] mb-4" style={{ color: "rgba(255,255,255,0.35)" }}>
                        Clicca un esempio per avviare subito — o scrivi la tua domanda
                      </p>
                      <div className="space-y-2">
                        {[
                          ["Quadro macro Italia","Dammi un quadro macroeconomico completo dell'Italia: inflazione, disoccupazione e crescita PIL"],
                          ["Confronto inflazione","Confronta l'inflazione di Italia, Germania e Spagna negli ultimi 24 mesi"],
                          ["Debito pubblico EU","Analizza il debito pubblico di Italia, Francia e Germania dal 2015"],
                          ["Resilienza economica","Confronta la resilienza economica di Italia e Spagna usando inflazione, disoccupazione e PIL"],
                        ].map(([label, query]) => (
                          <button key={label} onClick={() => closeOnboarding(query)}
                            className="w-full text-left rounded-lg px-4 py-3 transition-all duration-200"
                            style={{ background: "rgba(0,212,255,0.04)", border: "1px solid rgba(0,212,255,0.12)" }}
                            onMouseEnter={e => { e.currentTarget.style.background = "rgba(0,212,255,0.09)"; e.currentTarget.style.borderColor = "rgba(0,212,255,0.3)"; }}
                            onMouseLeave={e => { e.currentTarget.style.background = "rgba(0,212,255,0.04)"; e.currentTarget.style.borderColor = "rgba(0,212,255,0.12)"; }}>
                            <p className="font-mono text-[11px] font-semibold mb-0.5" style={{ color: "#00d4ff" }}>→ {label}</p>
                            <p className="font-mono text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>{query}</p>
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}

                </AnimatePresence>
              </div>

              {/* Footer navigation */}
              <div className="flex items-center justify-between px-6 pb-5">
                <button
                  onClick={() => setOnboardingSlide(s => Math.max(0, s - 1))}
                  className="font-mono text-[11px] uppercase tracking-widest transition-colors"
                  style={{ color: onboardingSlide === 0 ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.4)", cursor: onboardingSlide === 0 ? "default" : "pointer" }}
                  disabled={onboardingSlide === 0}>
                  ← Indietro
                </button>
                {onboardingSlide < 3 ? (
                  <button
                    onClick={() => setOnboardingSlide(s => s + 1)}
                    className="font-mono text-[12px] font-semibold px-5 py-2 rounded-lg transition-all duration-200"
                    style={{ background: "#00d4ff", color: "#07080d" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#00bde8")}
                    onMouseLeave={e => (e.currentTarget.style.background = "#00d4ff")}>
                    Avanti →
                  </button>
                ) : (
                  <button
                    onClick={() => closeOnboarding()}
                    className="font-mono text-[12px] font-semibold px-5 py-2 rounded-lg transition-all duration-200"
                    style={{ background: "#00d4ff", color: "#07080d" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#00bde8")}
                    onMouseLeave={e => (e.currentTarget.style.background = "#00d4ff")}>
                    Inizia →
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}