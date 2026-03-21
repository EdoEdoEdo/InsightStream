/**
 * @file __tests__/suggestion-parser.test.ts
 * @description Unit tests for the suggestion parsing logic in SuggestionChips.
 *
 * Covers:
 *   - Fenced code block extraction (```suggestions ... ```)
 *   - Raw JSON extraction ({"suggestions": [...]})
 *   - Partial/malformed JSON resilience
 *   - Clean text stripping of suggestion blocks
 */

import { describe, it, expect } from "vitest";
import { parseSuggestions } from "@/app/components/ui/SuggestionChips";

// ─── Fenced block format ──────────────────────────────────────────────────────

describe("parseSuggestions — fenced blocks", () => {
  it("extracts suggestions from a fenced code block", () => {
    const content = `**Dato**: L'inflazione è al 2.3%.

\`\`\`suggestions
{"suggestions":[{"label":"Confronta con DE","prompt":"Confronta inflazione di IT e DE"},{"label":"PIL","prompt":"Mostrami crescita PIL"}]}
\`\`\``;

    const { cleanText, suggestions } = parseSuggestions(content);
    expect(suggestions).toHaveLength(2);
    expect(suggestions[0].label).toBe("Confronta con DE");
    expect(suggestions[1].prompt).toBe("Mostrami crescita PIL");
    expect(cleanText).not.toContain("suggestions");
    expect(cleanText).toContain("2.3%");
  });

  it("strips the fenced block from cleanText", () => {
    const content = `Testo prima.\n\n\`\`\`suggestions\n{"suggestions":[]}\n\`\`\``;
    const { cleanText } = parseSuggestions(content);
    expect(cleanText.trim()).toBe("Testo prima.");
  });

  it("handles malformed JSON inside fenced block gracefully", () => {
    const content = `Analisi completa.\n\n\`\`\`suggestions\n{broken json\n\`\`\``;
    const { cleanText, suggestions } = parseSuggestions(content);
    expect(suggestions).toHaveLength(0);
    expect(cleanText).toContain("Analisi completa");
  });
});

// ─── Raw JSON format ──────────────────────────────────────────────────────────

describe("parseSuggestions — raw JSON", () => {
  it("extracts suggestions from raw JSON leaked in text", () => {
    const content = `L'inflazione italiana è in calo.

{"suggestions":[{"label":"Serie storica","prompt":"Mostrami inflazione ultimi 48 mesi"}]}`;

    const { cleanText, suggestions } = parseSuggestions(content);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].label).toBe("Serie storica");
    expect(cleanText).not.toContain("suggestions");
    expect(cleanText).toContain("in calo");
  });

  it("strips trailing partial JSON artifacts", () => {
    const content = `Tendenza positiva. {suggestions`;
    const { cleanText } = parseSuggestions(content);
    // Should strip the trailing `{suggestions` artifact
    expect(cleanText).not.toContain("{suggestions");
    expect(cleanText).toContain("Tendenza positiva");
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe("parseSuggestions — edge cases", () => {
  it("returns empty suggestions for content with no suggestion block", () => {
    const { cleanText, suggestions } = parseSuggestions("Just normal text.");
    expect(suggestions).toHaveLength(0);
    expect(cleanText).toBe("Just normal text.");
  });

  it("returns empty suggestions for empty string", () => {
    const { cleanText, suggestions } = parseSuggestions("");
    expect(suggestions).toHaveLength(0);
    expect(cleanText).toBe("");
  });

  it("handles suggestions field that is not an array", () => {
    const content = `\`\`\`suggestions\n{"suggestions":"not an array"}\n\`\`\``;
    const { suggestions } = parseSuggestions(content);
    expect(suggestions).toHaveLength(0);
  });

  it("handles missing suggestions field", () => {
    const content = `\`\`\`suggestions\n{"other":"data"}\n\`\`\``;
    const { suggestions } = parseSuggestions(content);
    expect(suggestions).toHaveLength(0);
  });

  it("prefers fenced block over raw JSON when both exist", () => {
    const content = `{"suggestions":[{"label":"raw","prompt":"raw"}]}

\`\`\`suggestions
{"suggestions":[{"label":"fenced","prompt":"fenced"}]}
\`\`\``;

    const { suggestions } = parseSuggestions(content);
    // Fenced is matched first in the function
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].label).toBe("fenced");
  });

  it("handles 3 suggestions (typical AI output)", () => {
    const content = `Analisi completata.

\`\`\`suggestions
{"suggestions":[{"label":"Confronta DE","prompt":"Confronta con Germania"},{"label":"Disoccupazione","prompt":"Mostrami disoccupazione"},{"label":"48 mesi","prompt":"Serie storica 48 mesi"}]}
\`\`\``;

    const { suggestions } = parseSuggestions(content);
    expect(suggestions).toHaveLength(3);
  });
});
