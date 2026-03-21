"use client";

/**
 * @file app/components/ui/InfoPanel.tsx
 * @description Slide-in panel with 3 tabs: About / Dati / Modello AI.
 * Includes model switcher that persists selection to localStorage.
 *
 * Refactored: all hover effects use Tailwind classes instead of imperative
 * onMouseEnter/onMouseLeave style manipulation.
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ModelId } from "@/app/utils/models";
import { MODELS } from "@/app/utils/models";

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = "about" | "data" | "model";

interface InfoPanelProps {
  isOpen:        boolean;
  onClose:       () => void;
  selectedModel: ModelId;
  onModelChange: (id: ModelId) => void;
}

// ─── Tab content ──────────────────────────────────────────────────────────────

function AboutTab(): React.ReactElement {
  return (
    <div className="space-y-5">
      <div>
        <p className="font-mono text-[9px] uppercase tracking-widest mb-2 text-[#00d4ff]">
          Il progetto
        </p>
        <p className="text-sm leading-relaxed text-white/65">
          InsightStream è una dashboard di analisi economica europea in linguaggio naturale.
          Combina dati ufficiali Eurostat con AI generativa per rendere l&apos;analisi macro
          accessibile a chiunque — senza bisogno di conoscenze tecniche o statistiche.
        </p>
      </div>

      <div>
        <p className="font-mono text-[9px] uppercase tracking-widest mb-2 text-[#00d4ff]">
          Come funziona
        </p>
        <div className="space-y-2">
          {[
            { n: "1", t: "Scrivi una domanda",    d: "In italiano, in linguaggio libero. Es: 'Come sta l'inflazione italiana rispetto alla Germania?'" },
            { n: "2", t: "L'AI recupera i dati",  d: "Il modello chiama automaticamente l'API Eurostat per ottenere dati reali e aggiornati." },
            { n: "3", t: "Analisi + grafico",      d: "Ricevi un'analisi testuale e un grafico interattivo con serie temporale e confronto tra paesi." },
            { n: "4", t: "Approfondisci",          d: "Usa i chip suggeriti sotto ogni risposta per esplorare indicatori correlati o confronti aggiuntivi." },
          ].map(({ n, t, d }) => (
            <div
              key={n}
              className="flex gap-3 rounded-lg p-3 bg-white/[0.03] border border-white/[0.06]"
            >
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 bg-[rgba(0,212,255,0.15)] border border-[rgba(0,212,255,0.25)]"
              >
                <span className="font-mono text-[9px] text-[#00d4ff]">{n}</span>
              </div>
              <div>
                <p className="text-xs font-semibold text-white/80 mb-0.5">{t}</p>
                <p className="text-xs leading-relaxed text-white/45">{d}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg p-3 bg-[rgba(0,212,255,0.05)] border border-[rgba(0,212,255,0.15)]">
        <p className="font-mono text-[9px] uppercase tracking-widest mb-1 text-[#00d4ff]">
          Stack tecnico
        </p>
        <p className="text-xs leading-relaxed text-white/45">
          Next.js 15 · Vercel AI SDK v4 · Groq / Mistral · Eurostat SDMX API · Recharts · Framer Motion
        </p>
      </div>

      <div className="pt-2 border-t border-white/[0.06]">
        <p className="font-mono text-[10px] text-white/25 text-center">
          un progetto di{" "}
          <a
            href="https://www.edoedoedo.it/"
            target="_blank"
            rel="noopener noreferrer"
            className="italic line-through text-white/40 hover:text-[#00d4ff] transition-colors"
          >
            EDOEDOEDO
          </a>
        </p>
      </div>
    </div>
  );
}

function DataTab(): React.ReactElement {
  const indicators = [
    { label: "Inflazione HICP",     code: "prc_hicp_manr",   freq: "Mensile",     desc: "Variazione % annua prezzi al consumo" },
    { label: "Disoccupazione",      code: "une_rt_m",        freq: "Mensile",     desc: "% forza lavoro disoccupata" },
    { label: "Prezzi elettricità",  code: "nrg_pc_204",      freq: "Semestrale",  desc: "€/kWh famiglie (IVA esclusa)" },
    { label: "Crescita PIL",        code: "namq_10_gdp",     freq: "Trimestrale", desc: "% variazione PIL reale" },
    { label: "Fiducia consumatori", code: "ei_bsco_m",       freq: "Mensile",     desc: "Indice sentiment consumatori" },
    { label: "Prezzi immobili",     code: "prc_hpi_q",       freq: "Trimestrale", desc: "Indice prezzi abitazioni (2015=100)" },
    { label: "NEET giovani",        code: "edat_lfse_20",    freq: "Annuale",     desc: "% giovani 15-29 fuori da lavoro e studio" },
    { label: "Energia rinnovabile", code: "nrg_ind_ren",     freq: "Annuale",     desc: "% rinnovabili su consumo finale lordo" },
    { label: "Debito pubblico",     code: "gov_10dd_edpt1",  freq: "Annuale",     desc: "Debito PA consolidato % PIL" },
  ];

  return (
    <div className="space-y-4">
      <div>
        <p className="font-mono text-[9px] uppercase tracking-widest mb-1 text-[#00d4ff]">
          Fonte dati
        </p>
        <p className="text-xs leading-relaxed text-white/55">
          Tutti i dati provengono da{" "}
          <a
            href="https://ec.europa.eu/eurostat"
            target="_blank"
            rel="noopener noreferrer"
            className="underline text-[#00d4ff]"
          >
            Eurostat
          </a>{" "}
          — l&apos;ufficio statistico dell&apos;Unione Europea. I dati sono pubblici, gratuiti e
          aggiornati automaticamente due volte al giorno (11:00 e 23:00 CET).
        </p>
      </div>

      <div>
        <p className="font-mono text-[9px] uppercase tracking-widest mb-2 text-[#00d4ff]">
          Indicatori disponibili ({indicators.length})
        </p>
        <div className="space-y-1.5">
          {indicators.map(({ label, code, freq, desc }) => (
            <div
              key={code}
              className="rounded-lg px-3 py-2.5 bg-white/[0.03] border border-white/[0.06]"
            >
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-xs font-medium text-white/75">{label}</span>
                <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-white/35">
                  {freq}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/35">{desc}</span>
                <span className="font-mono text-[9px] text-[rgba(0,212,255,0.5)]">{code}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg p-3 bg-white/[0.02] border border-white/5">
        <p className="text-xs text-white/35">
          I dati vengono cachati in memoria per 1 ora per ridurre le chiamate API.
          La cache viene invalidata automaticamente a ogni nuovo deploy.
        </p>
      </div>
    </div>
  );
}

function ModelTab({
  selectedModel,
  onModelChange,
}: {
  selectedModel: ModelId;
  onModelChange: (id: ModelId) => void;
}): React.ReactElement {
  return (
    <div className="space-y-4">
      <div>
        <p className="font-mono text-[9px] uppercase tracking-widest mb-1 text-[#00d4ff]">
          Modello AI attivo
        </p>
        <p className="text-xs leading-relaxed text-white/45">
          Seleziona il modello da usare per l&apos;analisi. Puoi cambiarlo in qualsiasi momento —
          il cambio avrà effetto dal prossimo messaggio.
        </p>
      </div>

      <div className="space-y-2">
        {(Object.entries(MODELS) as [ModelId, (typeof MODELS)[ModelId]][]).map(([id, model]) => {
          const isActive = selectedModel === id;
          return (
            <button
              key={id}
              onClick={() => onModelChange(id)}
              className={`w-full text-left rounded-xl p-4 transition-all duration-200
                ${isActive
                  ? ""
                  : "bg-white/[0.03] border border-white/8 hover:bg-white/[0.05] hover:border-white/15"
                }`}
              style={
                isActive
                  ? {
                      background: `${model.color}12`,
                      border: `1px solid ${model.color}35`,
                    }
                  : undefined
              }
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                  {isActive && (
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: model.color }} />
                  )}
                  <span className={`text-sm font-semibold ${isActive ? "text-white" : "text-white/65"}`}>
                    {model.name}
                  </span>
                  <span
                    className="font-mono text-[9px] px-1.5 py-0.5 rounded"
                    style={{
                      background: `${model.color}20`,
                      color: model.color,
                      border: `1px solid ${model.color}30`,
                    }}
                  >
                    {model.provider}
                  </span>
                </div>
                {model.free && (
                  <span className="font-mono text-[9px] px-1.5 py-0.5 rounded shrink-0 bg-[rgba(34,211,165,0.1)] text-[#22d3a5] border border-[rgba(34,211,165,0.2)]">
                    Free
                  </span>
                )}
              </div>
              <p className="text-xs mb-2 text-white/40">{model.description}</p>
              <div className="flex flex-wrap gap-2">
                {model.stats.map((s, i) => (
                  <span key={i} className="font-mono text-[9px] text-white/30">{s}</span>
                ))}
              </div>
              {model.apiKeyEnv && !isActive && (
                <p className="font-mono text-[9px] mt-2 text-white/25">
                  Richiede: {model.apiKeyEnv}
                </p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function InfoPanel({
  isOpen,
  onClose,
  selectedModel,
  onModelChange,
}: InfoPanelProps): React.ReactElement {
  const [tab, setTab] = useState<Tab>("about");

  const tabs: { id: Tab; label: string }[] = [
    { id: "about", label: "About" },
    { id: "data",  label: "Dati" },
    { id: "model", label: "Modello AI" },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-[rgba(7,8,13,0.6)] backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-sm flex flex-col bg-[#0a0c12] border-l border-white/8"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 h-14 shrink-0 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[#00d4ff]" />
                <span className="font-mono text-xs text-white/60 uppercase tracking-widest">
                  InsightStream
                </span>
              </div>
              <button
                onClick={onClose}
                className="w-7 h-7 rounded-lg flex items-center justify-center bg-white/5 border border-white/8 hover:bg-white/10 transition-all"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M1 1l8 8M9 1L1 9" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {/* Tabs */}
            <div className="flex px-4 pt-3 pb-0 gap-1 shrink-0">
              {tabs.map(({ id, label }) => {
                const active = tab === id;
                return (
                  <button
                    key={id}
                    onClick={() => setTab(id)}
                    className={`px-3 py-1.5 rounded-lg font-mono text-[10px] uppercase tracking-widest transition-all duration-150
                      ${active
                        ? "bg-[rgba(0,212,255,0.1)] border border-[rgba(0,212,255,0.25)] text-[#00d4ff]"
                        : "border border-transparent text-white/35 hover:text-white/50"
                      }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <AnimatePresence mode="wait">
                <motion.div
                  key={tab}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.15 }}
                >
                  {tab === "about" && <AboutTab />}
                  {tab === "data"  && <DataTab />}
                  {tab === "model" && (
                    <ModelTab selectedModel={selectedModel} onModelChange={onModelChange} />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
