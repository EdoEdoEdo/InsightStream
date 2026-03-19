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
    } catch { /* ignore */ }
    cleanText = content.replace(fencedRegex, "").trimEnd();
    return { cleanText, suggestions };
  }

  const rawMatch = content.match(rawRegex);
  if (rawMatch) {
    try {
      const parsed = JSON.parse(rawMatch[0]);
      suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
    } catch { /* ignore */ }
    cleanText = content.replace(rawRegex, "").trimEnd();
    // Also strip any trailing label like {suggestions or similar artifacts
    cleanText = cleanText.replace(/\{\s*suggestions?\s*$/i, "").trimEnd();
    return { cleanText, suggestions };
  }

  return { cleanText: content, suggestions: [] };
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
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs
                     transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background:  "rgba(0,212,255,0.06)",
            border:      "1px solid rgba(0,212,255,0.2)",
            color:       "rgba(255,255,255,0.6)",
            fontFamily:  "'DM Mono', monospace",
            fontSize:    "10px",
            letterSpacing: "0.02em",
          }}
          onMouseEnter={(e) => {
            if (isLoading) return;
            (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,212,255,0.12)";
            (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(0,212,255,0.4)";
            (e.currentTarget as HTMLButtonElement).style.color = "#fff";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,212,255,0.06)";
            (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(0,212,255,0.2)";
            (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.6)";
          }}
        >
          <span style={{ color: "#00d4ff", fontSize: "9px" }}>→</span>
          {s.label}
        </motion.button>
      ))}
    </motion.div>
  );
});

SuggestionChips.displayName = "SuggestionChips";
