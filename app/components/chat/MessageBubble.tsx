"use client";

/**
 * @file app/components/chat/MessageBubble.tsx
 * @description Chat message rendering — handles user + assistant bubbles,
 * tool invocation states (skeleton → chart), and suggestion chips.
 *
 * Includes fallback chip generation: when the AI stream is cut mid-response
 * (rate limit, network error) and no ```suggestions block was generated,
 * we derive contextual chips from the tool result data.
 */

import { memo, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Message } from "@ai-sdk/react";
import {
  EuroChartSkeleton,
  EuroChartErrorBoundary,
} from "@/app/components/ai/EurostatChart";
import { EconomicChart } from "@/app/components/ai/EconomicChart";
import { SuggestionChips, parseSuggestions } from "@/app/components/ui/SuggestionChips";
import type { Suggestion } from "@/app/components/ui/SuggestionChips";
import { C } from "@/app/lib/design-tokens";
import type { EurostatResult } from "@/app/utils/eurostat-client";

// ─── Indicator → related indicator map (for fallback chips) ───────────────────

const INDICATOR_LABELS: Record<string, string> = {
  inflation: "inflazione",
  unemployment: "disoccupazione",
  gdp_growth: "crescita PIL",
  consumer_confidence: "fiducia dei consumatori",
  house_prices: "prezzi degli immobili",
  neet_youth: "giovani NEET",
  renewables: "rinnovabili",
  public_debt: "debito pubblico",
  energy_prices: "prezzi energia",
  industrial_production: "produzione industriale",
};

const RELATED_INDICATOR: Record<string, string> = {
  inflation: "fiducia dei consumatori",
  unemployment: "giovani NEET",
  gdp_growth: "debito pubblico",
  consumer_confidence: "inflazione",
  house_prices: "crescita PIL",
  neet_youth: "disoccupazione",
  renewables: "prezzi energia",
  public_debt: "crescita PIL",
  energy_prices: "rinnovabili",
  industrial_production: "crescita PIL",
};

// ─── Tool invocation block ────────────────────────────────────────────────────

interface ToolInvocation {
  toolCallId: string;
  toolName: string;
  state: "partial-call" | "call" | "result";
  result?: unknown;
}

interface ToolBlockProps {
  toolName: string;
  state: "partial-call" | "call" | "result";
  result: unknown;
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

// ─── Fallback chips generator ─────────────────────────────────────────────────

/**
 * When the AI stream is cut (rate limit / network error) before generating
 * the ```suggestions block, we derive 3 contextual chips from the last
 * tool result so the user isn't left with a dead end.
 */
function buildFallbackChips(toolInvocations?: ToolInvocation[]): Suggestion[] {
  if (!toolInvocations?.length) return [];

  for (const inv of toolInvocations) {
    if (inv.toolName === "getEurostatData" && inv.state === "result" && inv.result) {
      const r = inv.result as {
        indicator?: string;
        countries?: string[];
        indicatorLabel?: string;
      };
      if (!r.indicator) continue;

      const indicatorLabel = INDICATOR_LABELS[r.indicator] ?? r.indicator.replace(/_/g, " ");
      const countriesText = r.countries?.join(", ") ?? "Italia";
      const related = RELATED_INDICATOR[r.indicator] ?? "inflazione";

      return [
        {
          label: "Serie 48 mesi",
          prompt: `Mostrami ${indicatorLabel} degli ultimi 48 mesi per ${countriesText}`,
        },
        {
          label: related.charAt(0).toUpperCase() + related.slice(1),
          prompt: `Mostrami ${related} per ${countriesText}`,
        },
        {
          label: "Confronta con EU",
          prompt: `Confronta ${indicatorLabel} di ${countriesText} e media EU27`,
        },
      ];
    }
  }
  return [];
}

// ─── Assistant text with structured sections ──────────────────────────────────

function AssistantContent({
  content,
  onSuggest,
  isLoading,
  showSuggestions,
  toolInvocations,
}: {
  content: string;
  onSuggest: (p: string) => void;
  isLoading: boolean;
  showSuggestions: boolean;
  toolInvocations?: ToolInvocation[];
}) {
  // Only skip parsing for the actively streaming message (the last one).
  // Completed messages must always parse — otherwise old messages flash raw JSON
  // when a new stream starts and isLoading becomes true globally.
  const isActivelyStreaming = isLoading && showSuggestions;
  const { cleanText, suggestions } = useMemo(
    () => (isActivelyStreaming ? { cleanText: content, suggestions: [] } : parseSuggestions(content)),
    [content, isActivelyStreaming],
  );

  // Fallback chips when AI didn't generate suggestion block (rate limit, cut stream)
  const fallbackChips = useMemo(
    () => (!isLoading && suggestions.length === 0 ? buildFallbackChips(toolInvocations) : []),
    [isLoading, suggestions.length, toolInvocations],
  );

  const effectiveSuggestions = suggestions.length > 0 ? suggestions : fallbackChips;

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
          const datoMatch = line.match(/^\*\*Dato\*\*\s*:?\s*(.*)/i);
          const contestoMatch = line.match(/^\*\*Contesto\*\*\s*:?\s*(.*)/i);
          const tendenzaMatch = line.match(/^\*\*Tendenza\*\*\s*:?\s*(.*)/i);

          if (datoMatch) {
            return (
              <div key={i} className={i > 0 ? "mt-3" : ""}>
                <SectionLabel label="DATO" color="#00c8c8" bgColor="rgba(0,200,200,0.12)" borderColor="rgba(0,200,200,0.25)" />
                <span style={{ color: "rgba(255,255,255,0.9)" }}>{datoMatch[1]}</span>
              </div>
            );
          }

          if (contestoMatch) {
            return (
              <div key={i} className={i > 0 ? "mt-3" : ""}>
                <SectionLabel label="CONTESTO" color="#94a3b8" bgColor="rgba(148,163,184,0.1)" borderColor="rgba(148,163,184,0.2)" />
                <span>{contestoMatch[1]}</span>
              </div>
            );
          }

          if (tendenzaMatch) {
            return (
              <div key={i} className={i > 0 ? "mt-3" : ""}>
                <SectionLabel label="TENDENZA" color="#94a3b8" bgColor="rgba(148,163,184,0.1)" borderColor="rgba(148,163,184,0.2)" />
                {tendenzaMatch[1] && <BoldText text={tendenzaMatch[1]} />}
              </div>
            );
          }

          // Bullet lines with Positiva/Negativa/Stabile
          const bulletMatch = line.match(
            /^-\s+\*{0,2}([^*:]+?)\*{0,2}\s*:\s*\*{0,2}(Positiv[ao]|Negativ[ao]|Stabil[ei])\*{0,2}(.*)/i,
          );
          if (bulletMatch) {
            const tendency = bulletMatch[2].toLowerCase();
            const isPos = tendency.startsWith("positiv");
            const isNeg = tendency.startsWith("negativ");
            const color = isPos ? "#4ade80" : isNeg ? "#f87171" : "#94a3b8";
            return (
              <p key={i} className={i > 0 ? "mt-1" : ""}>
                <span className="text-white/50 mr-1">—</span>
                <strong className="text-white/90">{bulletMatch[1]}</strong>
                <span className="mx-1.5 text-white/30">·</span>
                <span className="font-semibold" style={{ color }}>
                  {bulletMatch[2]}
                </span>
                <span className="text-white/50">{bulletMatch[3]}</span>
              </p>
            );
          }

          // Default line with bold support
          return (
            <p key={i} className={i > 0 ? "mt-1.5" : ""}>
              <BoldText text={line} />
            </p>
          );
        })}
      </div>

      {showSuggestions && effectiveSuggestions.length > 0 && (
        <SuggestionChips
          suggestions={effectiveSuggestions}
          onSelect={onSuggest}
          isLoading={isLoading}
        />
      )}
    </>
  );
}

// ─── Reusable inline helpers ──────────────────────────────────────────────────

function SectionLabel({
  label,
  color,
  bgColor,
  borderColor,
}: {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold tracking-widest uppercase px-2 py-0.5 rounded-md mr-2"
      style={{ background: bgColor, color, border: `0.5px solid ${borderColor}` }}
    >
      {label}
    </span>
  );
}

/** Renders text with **bold** markdown support */
function BoldText({ text }: { text: string }) {
  return (
    <span style={{ color: "rgba(255,255,255,0.75)" }}>
      {text.split(/(\*\*[^*]+\*\*)/).map((seg, j) =>
        seg.startsWith("**") && seg.endsWith("**") ? (
          <strong key={j} className="font-semibold text-white/90">
            {seg.slice(2, -2)}
          </strong>
        ) : (
          <span key={j}>{seg}</span>
        ),
      )}
    </span>
  );
}

// ─── Main message bubble ──────────────────────────────────────────────────────

export interface MessageBubbleProps {
  message: Message;
  onSuggest: (prompt: string) => void;
  isLoading: boolean;
  isLast: boolean;
}

export const MessageBubble = memo(function MessageBubble({
  message,
  onSuggest,
  isLoading,
  isLast,
}: MessageBubbleProps) {
  const isUser = message.role === "user";

  // Cast toolInvocations to our internal type for safe access
  const toolInvocations = message.toolInvocations as ToolInvocation[] | undefined;

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

        {!isUser &&
          toolInvocations?.map((tool) => (
            <ToolBlock
              key={tool.toolCallId}
              toolName={tool.toolName}
              state={tool.state}
              result={tool.result}
            />
          ))}

        {message.content &&
          (isUser ? (
            <div
              className="rounded-xl px-4 py-3 text-sm leading-relaxed"
              style={{
                background: `linear-gradient(135deg, ${C.amber}18, ${C.amber}08)`,
                border: `1px solid ${C.amber}25`,
                color: "rgba(255,255,255,0.9)",
              }}
            >
              {message.content.split("\n").map((line, i) =>
                line.trim() ? (
                  <p key={i} className={i > 0 ? "mt-2" : ""}>
                    {line}
                  </p>
                ) : null,
              )}
            </div>
          ) : (
            <AssistantContent
              content={message.content}
              onSuggest={onSuggest}
              isLoading={isLoading}
              showSuggestions={isLast}
              toolInvocations={toolInvocations}
            />
          ))}
      </div>
    </motion.div>
  );
});

MessageBubble.displayName = "MessageBubble";
