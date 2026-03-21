"use client";

/**
 * @file app/components/onboarding/OnboardingModal.tsx
 * @description First-visit onboarding flow with 4 slides.
 * Shown once per session (sessionStorage gate).
 *
 * FIX: Previously this was duplicated in page.tsx — two identical modals
 * rendered on top of each other. Now a single component.
 */

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ─── Types ────────────────────────────────────────────────────────────────────

interface OnboardingModalProps {
  isOpen:  boolean;
  onClose: (startQuery?: string) => void;
}

// ─── Slide data ───────────────────────────────────────────────────────────────

const FEATURES = [
  ["💬  Chat in linguaggio naturale", "Nessun filtro da configurare — scrivi come parleresti a un analista"],
  ["📊  Grafici generativi", "Ogni risposta produce un grafico interattivo con dati reali Eurostat"],
  ["🤖  AI agentica", "Il modello chiama autonomamente le API — non inventa mai i numeri"],
  ["🔄  Multi-modello", "Scegli tra Groq, Mistral AI e Google Gemini dall'icona ⓘ"],
] as const;

const DATA_INDICATORS = [
  ["Inflazione HICP",        "% annua prezzi consumo",   "mensile"],
  ["Disoccupazione",         "% forza lavoro",           "mensile"],
  ["Crescita PIL",           "% variazione reale",       "trimestrale"],
  ["Fiducia consumatori",    "Indice di sentiment",      "mensile"],
  ["Prezzi energia",         "€/kWh famiglie",           "semestrale"],
  ["Prezzi immobili",        "Indice 2015=100",          "trimestrale"],
  ["NEET giovani",           "% under 30",               "annuale"],
  ["Rinnovabili",            "% mix energetico",         "annuale"],
  ["Debito pubblico",        "% del PIL",                "annuale"],
  ["Produzione industriale", "Indice manifatturiero",    "mensile"],
] as const;

const AI_MODELS = [
  ["Llama 3.3 70B",     "Groq",       "#f97316", "Default — migliore qualità analitica e ragionamento multi-indicatore"],
  ["Llama 3.1 8B",      "Groq",       "#f97316", "Ultra-veloce — ideale per query semplici e sessioni ad alto volume"],
  ["Mistral Small",     "Mistral AI", "#8b5cf6", "Modello europeo — ottimo multilingual, 1B token/mese gratuiti"],
  ["Gemini 2.0 Flash",  "Google AI",  "#22d3a5", "Velocissimo — ottimo supporto tool calling, aggiornato 2025"],
] as const;

const STARTER_QUERIES = [
  ["Quadro macro Italia",    "Dammi un quadro macroeconomico completo dell'Italia: inflazione, disoccupazione e crescita PIL"],
  ["Confronto inflazione",   "Confronta l'inflazione di Italia, Germania e Spagna negli ultimi 24 mesi"],
  ["Debito pubblico EU",     "Analizza il debito pubblico di Italia, Francia e Germania dal 2015"],
  ["Resilienza economica",   "Confronta la resilienza economica di Italia e Spagna usando inflazione, disoccupazione e PIL"],
] as const;

const TOTAL_SLIDES = 4;

// ─── Component ────────────────────────────────────────────────────────────────

export function OnboardingModal({ isOpen, onClose }: OnboardingModalProps) {
  const [slide, setSlide] = useState(0);

  const handleClose = useCallback(
    (query?: string) => {
      setSlide(0);
      onClose(query);
    },
    [onClose],
  );

  if (!isOpen) return null;

  return (
    <AnimatePresence>
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
              {Array.from({ length: TOTAL_SLIDES }, (_, i) => (
                <div
                  key={i}
                  className="rounded-full transition-all duration-300"
                  style={{
                    width:      i === slide ? "20px" : "6px",
                    height:     "6px",
                    background: i === slide ? "#00d4ff" : "rgba(255,255,255,0.15)",
                  }}
                />
              ))}
            </div>
            <button
              onClick={() => handleClose()}
              className="font-mono text-[11px] uppercase tracking-widest text-white/25 hover:text-white/50 transition-colors"
            >
              Skip
            </button>
          </div>

          {/* Slides */}
          <div className="px-6 py-6" style={{ minHeight: "340px" }}>
            <AnimatePresence mode="wait">
              {slide === 0 && <SlideProduct key="s0" />}
              {slide === 1 && <SlideData key="s1" />}
              {slide === 2 && <SlideModels key="s2" />}
              {slide === 3 && <SlideStart key="s3" onStart={handleClose} />}
            </AnimatePresence>
          </div>

          {/* Footer navigation */}
          <div className="flex items-center justify-between px-6 pb-5">
            <button
              onClick={() => setSlide((s) => Math.max(0, s - 1))}
              disabled={slide === 0}
              className="font-mono text-[11px] uppercase tracking-widest transition-colors disabled:text-white/10 disabled:cursor-default text-white/40 hover:text-white/60"
            >
              ← Indietro
            </button>
            {slide < TOTAL_SLIDES - 1 ? (
              <button
                onClick={() => setSlide((s) => s + 1)}
                className="font-mono text-[12px] font-semibold px-5 py-2 rounded-lg bg-[#00d4ff] text-[#07080d] hover:bg-[#00bde8] transition-colors"
              >
                Avanti →
              </button>
            ) : (
              <button
                onClick={() => handleClose()}
                className="font-mono text-[12px] font-semibold px-5 py-2 rounded-lg bg-[#00d4ff] text-[#07080d] hover:bg-[#00bde8] transition-colors"
              >
                Inizia →
              </button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Slide components ─────────────────────────────────────────────────────────

function SlideWrapper({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.25 }}
    >
      {children}
    </motion.div>
  );
}

function SlideProduct() {
  return (
    <SlideWrapper>
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.2)" }}
        >
          <LogoIcon size={20} />
        </div>
        <div>
          <h2 className="font-semibold text-lg text-white/95" style={{ fontFamily: "'Syne', sans-serif" }}>
            InsightStream
          </h2>
          <p className="font-mono text-[11px] text-[#00d4ff]">European Economic Intelligence</p>
        </div>
      </div>
      <p className="text-sm leading-relaxed mb-4 text-white/55">
        Fai una domanda in italiano sull&apos;economia europea. L&apos;AI recupera dati live da Eurostat,
        genera grafici interattivi e analizza trend — tutto in tempo reale, zero dati inventati.
      </p>
      <div className="space-y-2">
        {FEATURES.map(([title, desc]) => (
          <div
            key={String(title)}
            className="flex items-start gap-3 rounded-lg px-3 py-2.5"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <div>
              <p className="font-mono text-[11px] font-semibold mb-0.5 text-white/85">{title}</p>
              <p className="font-mono text-[10px] text-white/35">{desc}</p>
            </div>
          </div>
        ))}
      </div>
    </SlideWrapper>
  );
}

function SlideData() {
  return (
    <SlideWrapper>
      <h2 className="font-semibold text-base mb-1 text-white/95" style={{ fontFamily: "'Syne', sans-serif" }}>
        Dati & Mappa EU
      </h2>
      <p className="font-mono text-[11px] mb-4 text-white/35">
        Fonte: Eurostat · Aggiornamento 2× al giorno · Copertura 27 paesi EU
      </p>
      <div className="grid grid-cols-2 gap-3 mb-4">
        {DATA_INDICATORS.map(([name, desc, freq]) => (
          <div
            key={name}
            className="rounded-lg px-2.5 py-2"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <p className="font-mono text-[11px] font-semibold text-white/80">{name}</p>
            <p className="font-mono text-[10px] text-white/30">{desc}</p>
            <p className="font-mono text-[9px] mt-0.5" style={{ color: "rgba(0,212,255,0.5)" }}>{freq}</p>
          </div>
        ))}
      </div>
      <div
        className="rounded-lg px-3 py-2.5 flex items-start gap-3"
        style={{ background: "rgba(0,212,255,0.05)", border: "1px solid rgba(0,212,255,0.15)" }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="mt-0.5 flex-shrink-0">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#00d4ff" opacity="0.7" />
        </svg>
        <div>
          <p className="font-mono text-[11px] font-semibold mb-0.5 text-[#00d4ff]">Mappa EU Coropleta</p>
          <p className="font-mono text-[10px] text-white/40">
            Visualizza i dati su mappa geografica interattiva. Clicca un paese per analizzarlo
            direttamente. Attivala dall&apos;icona 🗺 in alto.
          </p>
        </div>
      </div>
    </SlideWrapper>
  );
}

function SlideModels() {
  return (
    <SlideWrapper>
      <h2 className="font-semibold text-base mb-1 text-white/95" style={{ fontFamily: "'Syne', sans-serif" }}>
        Modelli AI disponibili
      </h2>
      <p className="font-mono text-[11px] mb-4 text-white/35">
        Tutti gratuiti · Cambia modello in qualsiasi momento dall&apos;icona ⓘ
      </p>
      <div className="space-y-2.5 mb-4">
        {AI_MODELS.map(([name, provider, color, desc]) => (
          <div
            key={name}
            className="rounded-lg px-3 py-2.5"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
              <p className="font-mono text-[12px] font-semibold text-white/90">{name}</p>
              <p className="font-mono text-[10px] ml-auto" style={{ color }}>{provider}</p>
            </div>
            <p className="font-mono text-[10px] text-white/35">{desc}</p>
          </div>
        ))}
      </div>
      <div
        className="rounded-lg px-3 py-2.5"
        style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
      >
        <p className="font-mono text-[10px] text-white/30">
          💡 Se un modello non risponde, cambia provider — ogni servizio ha rate limit indipendenti.
        </p>
      </div>
    </SlideWrapper>
  );
}

function SlideStart({ onStart }: { onStart: (query?: string) => void }) {
  return (
    <SlideWrapper>
      <h2 className="font-semibold text-base mb-1 text-white/95" style={{ fontFamily: "'Syne', sans-serif" }}>
        Inizia la tua analisi
      </h2>
      <p className="font-mono text-[11px] mb-4 text-white/35">
        Clicca un esempio per avviare subito — o scrivi la tua domanda
      </p>
      <div className="space-y-2">
        {STARTER_QUERIES.map(([label, query]) => (
          <button
            key={label}
            onClick={() => onStart(query)}
            className="w-full text-left rounded-lg px-4 py-3 transition-all duration-200 bg-[rgba(0,212,255,0.04)] border border-[rgba(0,212,255,0.12)] hover:bg-[rgba(0,212,255,0.09)] hover:border-[rgba(0,212,255,0.3)]"
          >
            <p className="font-mono text-[11px] font-semibold mb-0.5 text-[#00d4ff]">→ {label}</p>
            <p className="font-mono text-[10px] text-white/30">{query}</p>
          </button>
        ))}
      </div>
    </SlideWrapper>
  );
}

// ─── Shared logo icon ─────────────────────────────────────────────────────────

function LogoIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <rect x="2" y="14" width="4" height="12" fill="#00d4ff" opacity="0.9" rx="1" />
      <rect x="10" y="8" width="4" height="18" fill="#00d4ff" opacity="0.7" rx="1" />
      <rect x="18" y="2" width="4" height="24" fill="#00d4ff" opacity="0.5" rx="1" />
      <path d="M2 10 L12 6 L20 2" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
