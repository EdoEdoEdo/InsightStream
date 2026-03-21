/**
 * @file app/lib/design-tokens.ts
 * @description Single source of truth for InsightStream design tokens.
 * Import these instead of hardcoding color values across components.
 */

export const C = {
  bg:      "#07080d",
  surface: "#0a0c12",
  border:  "rgba(255,255,255,0.08)",
  cyan:    "#00d4ff",
  amber:   "#ff8c42",
  muted:   "rgba(255,255,255,0.35)",
  good:    "#22d3a5",
  bad:     "#ff4d6d",
  neutral: "rgba(255,255,255,0.3)",
} as const;

export type DesignTokens = typeof C;
