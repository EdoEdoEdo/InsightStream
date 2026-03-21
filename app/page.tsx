"use client";

/**
 * @file app/page.tsx
 * @description InsightStream — Eurostat Economic Intelligence Dashboard.
 *
 * Refactored: all sub-components extracted into dedicated files.
 * This file orchestrates layout, state, and wiring between components.
 */

import { useChat } from "@ai-sdk/react";
import { useState, useRef, useEffect, useCallback, useDeferredValue } from "react";
import { motion, AnimatePresence } from "framer-motion";

import { HeroMetrics } from "@/app/components/chat/HeroMetrics";
import { MessageBubble } from "@/app/components/chat/MessageBubble";
import { ChatInput, type ChatInputHandle } from "@/app/components/chat/ChatInput";
import { OnboardingModal } from "@/app/components/onboarding/OnboardingModal";
import { InfoPanel } from "@/app/components/ui/InfoPanel";
import { EuroMap } from "@/app/components/ai/EuroMap";
import type { EuroIndicator } from "@/app/utils/eurostat-client";
import { DEFAULT_MODEL, MODELS, type ModelId } from "@/app/utils/models";
import { C } from "@/app/lib/design-tokens";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Detects if an error is likely a rate limit or network issue (vs. a code bug) */
function isNetworkOrRateLimit(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("network") ||
    lower.includes("rate") ||
    lower.includes("limit") ||
    lower.includes("429") ||
    lower.includes("503") ||
    lower.includes("quota") ||
    lower.includes("timeout") ||
    lower.includes("fetch failed")
  );
}

// ─── Suggested prompts (hero screen) ─────────────────────────────────────────

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

// ─── Main page ────────────────────────────────────────────────────────────────

export default function InsightStreamPage() {
  // ── Model selection (persisted in localStorage) ──
  const [selectedModel, setSelectedModel] = useState<ModelId>(DEFAULT_MODEL);
  useEffect(() => {
    const saved = localStorage.getItem("insightstream_model") as ModelId | null;
    if (saved && saved in MODELS) setSelectedModel(saved);
  }, []);

  const handleModelChange = useCallback((id: ModelId) => {
    setSelectedModel(id);
    localStorage.setItem("insightstream_model", id);
  }, []);

  // ── Onboarding (once per session) ──
  const [showOnboarding, setShowOnboarding] = useState(false);
  useEffect(() => {
    const seen = sessionStorage.getItem("insightstream_onboarding");
    if (!seen) setShowOnboarding(true);
  }, []);

  // ── Chat ──
  const chatInputRef = useRef<ChatInputHandle>(null);

  const { messages, input, handleInputChange, handleSubmit, isLoading, error, setMessages } =
    useChat({
      api: "/api/chat",
      body: { modelId: selectedModel },
      experimental_throttle: 50,
      onError: (err) => console.error("[InsightStream] Chat error:", err),
    });

  // ── UI panels ──
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [infoPanelOpen, setInfoPanelOpen]       = useState(false);
  const [mapOpen, setMapOpen]                   = useState(false);
  const [mapIndicator, setMapIndicator]         = useState<EuroIndicator>("inflation");
  const [highlightedCountries, setHighlightedCountries] = useState<string[]>([]);

  // ── Auto-scroll ──
  const messagesEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Extract highlighted countries from last AI tool call ──
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

  // ── Handlers (no more querySelector!) ──
  const handleCloseOnboarding = useCallback(
    (query?: string) => {
      sessionStorage.setItem("insightstream_onboarding", "1");
      setShowOnboarding(false);
      if (query) {
        // Small delay for exit animation, then submit via ref
        setTimeout(() => chatInputRef.current?.setAndSubmit(query), 300);
      }
    },
    [],
  );

  const handleReset = useCallback(() => {
    setMessages([]);
    setShowResetConfirm(false);
  }, [setMessages]);

  const handleSuggestedPrompt = useCallback(
    (prompt: string) => {
      chatInputRef.current?.setValue(prompt);
    },
    [],
  );

  const handleSuggestionChipSelect = useCallback(
    (prompt: string) => {
      if (isLoading) return;
      chatInputRef.current?.setAndSubmit(prompt);
    },
    [isLoading],
  );

  const handleMapCountryClick = useCallback(
    (code: string, label: string, indicator: EuroIndicator) => {
      const indicatorLabel = indicator.replace(/_/g, " ");
      chatInputRef.current?.setAndSubmit(
        `Analizza ${indicatorLabel} per ${label} (${code}) negli ultimi 24 mesi`,
      );
    },
    [],
  );

  const deferredMessages = useDeferredValue(messages);
  const isEmpty = deferredMessages.length === 0;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: C.bg, fontFamily: "'DM Mono', monospace" }}>
      {/* Noise texture */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.025]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* ── Header ── */}
      <header
        className="sticky top-0 z-50 flex items-center justify-between px-3 sm:px-6 h-14"
        style={{
          background: `${C.bg}e0`,
          backdropFilter: "blur(12px)",
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <div className="flex items-center gap-2 sm:gap-3">
          <div
            className="w-7 h-7 rounded-md flex items-center justify-center"
            style={{
              background: `linear-gradient(135deg, ${C.cyan}30, ${C.cyan}10)`,
              border: `1px solid ${C.cyan}40`,
            }}
          >
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
            <span
              className="ml-2 font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded-sm hidden sm:inline"
              style={{ color: C.cyan, background: `${C.cyan}15`, border: `1px solid ${C.cyan}25` }}
            >
              Eurostat Live
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Status indicator */}
          <div className="flex items-center gap-2">
            <div
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: isLoading ? C.amber : C.cyan, boxShadow: `0 0 6px ${isLoading ? C.amber : C.cyan}` }}
            />
            <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: C.muted }}>
              {isLoading ? "Analisi in corso" : "Pronto"}
            </span>
          </div>

          {/* Map toggle */}
          <HeaderButton active={mapOpen} onClick={() => setMapOpen((v) => !v)}>
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <path d="M1 3l3.5 1.5L8 2l2 1v5.5L8 7.5 4.5 9 1 7.5V3z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
              <path d="M4.5 9V4.5M8 7.5V2" stroke="currentColor" strokeWidth="1.2" />
            </svg>
            <span className="hidden sm:inline">Mappa</span>
          </HeaderButton>

          {/* Info button */}
          <HeaderButton onClick={() => setInfoPanelOpen(true)}>
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <circle cx="5.5" cy="5.5" r="4.5" stroke="currentColor" strokeWidth="1.2" />
              <path d="M5.5 5v3M5.5 3.5v.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            <span className="hidden sm:inline">Info</span>
          </HeaderButton>

          {/* Reset button */}
          <AnimatePresence>
            {messages.length > 0 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                transition={{ duration: 0.15 }}
              >
                <HeaderButton variant="danger" disabled={isLoading} onClick={() => setShowResetConfirm(true)}>
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  <span className="hidden sm:inline">Nuova analisi</span>
                </HeaderButton>
              </motion.div>
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
              <p className="font-mono text-[10px] uppercase tracking-widest mb-3" style={{ color: C.bad }}>
                Nuova analisi
              </p>
              <p className="text-sm text-white/70 leading-relaxed mb-6">
                La conversazione corrente verrà cancellata e tornerai alla home. Vuoi continuare?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowResetConfirm(false)}
                  className="flex-1 py-2 rounded-lg text-xs font-mono bg-white/5 border border-white/8 text-white/50 hover:bg-white/10 hover:text-white/70 transition-all duration-150"
                >
                  Annulla
                </button>
                <button
                  onClick={handleReset}
                  className="flex-1 py-2 rounded-lg text-xs font-mono bg-red-500/15 border border-red-500/30 text-[#ff4d6d] hover:bg-red-500/25 transition-all duration-150"
                >
                  Ricomincia
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Hero Metrics ── */}
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

      {/* ── Main content ── */}
      <main className="flex-1 flex flex-col max-w-3xl w-full mx-auto px-4 pb-36">
        {/* Hero (empty state) */}
        <AnimatePresence>
          {isEmpty && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col items-center justify-center flex-1 py-20 text-center"
            >
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mb-8"
                style={{
                  background: `radial-gradient(circle at 40% 40%, ${C.cyan}20, transparent)`,
                  border: `1px solid ${C.cyan}20`,
                  boxShadow: `0 0 60px ${C.cyan}10`,
                }}
              >
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                  <rect x="2" y="14" width="4" height="12" fill={C.cyan} opacity="0.9" rx="1" />
                  <rect x="10" y="8" width="4" height="18" fill={C.cyan} opacity="0.7" rx="1" />
                  <rect x="18" y="2" width="4" height="24" fill={C.cyan} opacity="0.5" rx="1" />
                  <path d="M2 10 L12 6 L20 2" stroke={C.amber} strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>

              <h1 className="text-3xl font-bold text-white tracking-tight mb-2" style={{ fontFamily: "'Syne', sans-serif" }}>
                InsightStream
              </h1>
              <p className="font-mono text-xs mb-1" style={{ color: C.cyan }}>
                European Economic Intelligence
              </p>
              <p className="text-sm max-w-sm leading-relaxed mt-2" style={{ color: C.muted }}>
                Analisi economica europea in linguaggio naturale. Dati live Eurostat — inflazione, lavoro, energia, immobili e molto altro.
              </p>

              <div className="grid grid-cols-2 gap-2 mt-10 w-full max-w-lg">
                {SUGGESTED_PROMPTS.map(({ label, prompt }) => (
                  <button
                    key={label}
                    onClick={() => handleSuggestedPrompt(prompt)}
                    className="rounded-lg px-4 py-3 text-left text-xs transition-all duration-200 text-white/35 border border-white/8 bg-[#0a0c12] hover:border-[rgba(0,212,255,0.35)] hover:text-white"
                  >
                    <span className="block font-mono text-[9px] uppercase tracking-widest mb-1" style={{ color: C.cyan }}>
                      →
                    </span>
                    {label}
                  </button>
                ))}
              </div>

              {/* Data source badge */}
              <div
                className="mt-8 flex items-center gap-2 px-3 py-1.5 rounded-full"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
              >
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
          <div className="flex-1 py-8 space-y-6" aria-live="polite">
            {deferredMessages.map((message, index) => (
              <MessageBubble
                key={message.id}
                message={message}
                onSuggest={handleSuggestionChipSelect}
                isLoading={isLoading}
                isLast={index === deferredMessages.length - 1}
              />
            ))}

            {isLoading && deferredMessages[deferredMessages.length - 1]?.role !== "assistant" && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-1.5 px-1 items-center">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-1 h-1 rounded-full"
                    style={{ background: C.cyan, animation: `bounce 1.2s ease-in-out ${i * 0.15}s infinite` }}
                  />
                ))}
              </motion.div>
            )}

            {error && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-red-500/20 bg-red-950/20 px-5 py-4"
              >
                <p className="font-mono text-[10px] text-red-400/60 uppercase tracking-widest mb-1">Errore</p>
                <p className="text-sm text-white/50">{error.message}</p>
                {isNetworkOrRateLimit(error.message) && (
                  <div className="mt-3 flex flex-col sm:flex-row gap-2">
                    <button
                      onClick={() => setInfoPanelOpen(true)}
                      className="text-[11px] font-mono px-3 py-1.5 rounded-lg bg-[rgba(0,212,255,0.08)] border border-[rgba(0,212,255,0.2)] text-[#00d4ff] hover:bg-[rgba(0,212,255,0.15)] transition-colors"
                    >
                      Cambia modello AI
                    </button>
                    <p className="text-[11px] text-white/30 font-mono self-center">
                      oppure attendi qualche secondo e riprova
                    </p>
                  </div>
                )}
              </motion.div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </main>

      {/* ── Chat Input ── */}
      <ChatInput
        ref={chatInputRef}
        input={input}
        isLoading={isLoading}
        handleInputChange={handleInputChange}
        handleSubmit={handleSubmit}
      />

      {/* ── Side panels & modals ── */}
      <InfoPanel
        isOpen={infoPanelOpen}
        onClose={() => setInfoPanelOpen(false)}
        selectedModel={selectedModel}
        onModelChange={handleModelChange}
      />

      {/* Single onboarding instance (was previously duplicated) */}
      <OnboardingModal isOpen={showOnboarding} onClose={handleCloseOnboarding} />

      {/* Global styles — fonts loaded via next/font in layout.tsx, no @import needed */}
      <style jsx global>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-4px); opacity: 1; }
        }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 9999px; }
      `}</style>
    </div>
  );
}

// ─── Reusable header button (replaces ~15 imperative hover handlers) ──────────

function HeaderButton({
  children,
  onClick,
  active = false,
  disabled = false,
  variant = "default",
}: {
  children:  React.ReactNode;
  onClick:   () => void;
  active?:   boolean;
  disabled?: boolean;
  variant?:  "default" | "danger";
}) {
  const baseClasses = "flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 rounded-lg transition-all duration-200 disabled:opacity-30 font-mono text-[10px] tracking-[0.04em]";

  if (active) {
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        className={`${baseClasses} bg-[rgba(0,212,255,0.1)] border border-[rgba(0,212,255,0.3)] text-[#00d4ff]`}
      >
        {children}
      </button>
    );
  }

  const hoverClasses = variant === "default"
    ? "hover:border-[rgba(0,212,255,0.3)] hover:text-[#00d4ff] hover:bg-[rgba(0,212,255,0.06)]"
    : "hover:border-[rgba(255,75,110,0.4)] hover:text-[#ff4d6d] hover:bg-[rgba(255,75,110,0.06)]";

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${baseClasses} bg-white/[0.04] border border-white/8 text-white/40 ${hoverClasses}`}
    >
      {children}
    </button>
  );
}
