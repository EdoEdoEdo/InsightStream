"use client";

/**
 * @file app/components/ui/SuggestionChips.tsx
 * @description Contextual suggestion chips rendered after each AI response.
 *
 * Parses the ```suggestions JSON block from AI message content,
 * strips it from displayed text, and renders clickable chips.
 */

import { memo } from "react";
import { motion } from "framer-motion";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Suggestion {
  label:  string;
  prompt: string;
}

// ─── Parser ───────────────────────────────────────────────────────────────────

/**
 * Extracts suggestions from AI message content.
 * Returns { cleanText, suggestions } — cleanText has the block removed.
 *
 * IMPORTANT: Only call this when streaming is complete (isLoading === false).
 * During streaming, partial JSON can match rawRegex and cause render errors.
 */
export function parseSuggestions(content: string): {
  cleanText:   string;
  suggestions: Suggestion[];
} {
  // Pattern 1: fenced code block ```suggestions ... ```
  const fencedRegex = /```suggestions\s*([\s\S]*?)```/;
  // Pattern 2: raw JSON object leaked into text {"suggestions":[...]}
  const rawRegex = /\{\s*"suggestions"\s*:\s*\[[\s\S]*?\]\s*\}/;

  let suggestions: Suggestion[] = [];
  let cleanText = content;

  const fencedMatch = content.match(fencedRegex);
  if (fencedMatch) {
    try {
      const parsed = JSON.parse(fencedMatch[1].trim());
      suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
    } catch { /* ignore malformed JSON */ }
    cleanText = content.replace(fencedRegex, "").trimEnd();
    return { cleanText, suggestions };
  }

  const rawMatch = content.match(rawRegex);
  if (rawMatch) {
    try {
      const parsed = JSON.parse(rawMatch[0]);
      suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
    } catch { /* ignore malformed JSON */ }
    cleanText = content.replace(rawRegex, "").trimEnd();
    // Strip trailing partial JSON artifacts
    cleanText = cleanText.replace(/\{\s*suggestions?\s*$/i, "").trimEnd();
    return { cleanText, suggestions };
  }

  // No complete suggestion block found — still strip partial JSON artifacts
  // from truncated streams (e.g. "{suggestions" at end of cut response)
  const stripped = content.replace(/\{\s*"?suggestions?"?\s*:?[^}]*$/i, "").trimEnd();
  return { cleanText: stripped || content, suggestions: [] };
}

// ─── Component ────────────────────────────────────────────────────────────────

interface SuggestionChipsProps {
  suggestions: Suggestion[];
  onSelect:    (prompt: string) => void;
  isLoading:   boolean;
}

export const SuggestionChips = memo(function SuggestionChips({
  suggestions,
  onSelect,
  isLoading,
}: SuggestionChipsProps): React.ReactElement | null {
  if (!suggestions.length) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-wrap gap-2 mt-3 pl-1"
    >
      {suggestions.map((s, i) => (
        <motion.button
          key={i}
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2, delay: 0.1 + i * 0.06 }}
          onClick={() => !isLoading && onSelect(s.prompt)}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono text-[10px] tracking-[0.02em] transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed bg-[rgba(0,212,255,0.06)] border border-[rgba(0,212,255,0.2)] text-white/60 hover:bg-[rgba(0,212,255,0.12)] hover:border-[rgba(0,212,255,0.4)] hover:text-white"
        >
          <span className="text-[#00d4ff] text-[9px]">→</span>
          {s.label}
        </motion.button>
      ))}
    </motion.div>
  );
});

SuggestionChips.displayName = "SuggestionChips";
