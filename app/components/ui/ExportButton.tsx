"use client";

/**
 * @file app/components/ui/ExportButton.tsx
 * @description PDF export component for InsightStream chart containers.
 *
 * Pipeline:
 *   1. Locate the target DOM node by `targetId`.
 *   2. Capture it with html2canvas (high-DPI, no CORS issues for inline SVG).
 *   3. Compose a jsPDF document:
 *        - Professional header  (logo mark + title + subtitle)
 *        - Divider line         (cyan accent)
 *        - Chart image          (scaled to page width with aspect-ratio lock)
 *        - Metadata footer      (area, metric, timestamp, page number)
 *   4. Trigger browser download.
 *
 * Design contract:
 *   - Never blocks the UI thread during capture (async, loading state).
 *   - Provides accessible feedback (aria-busy, aria-label).
 *   - 100% type-safe — no `any` casts.
 */

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExportButtonProps {
  /** The `id` attribute of the DOM element to capture. */
  targetId: string;
  /** Base filename for the downloaded PDF (no extension). */
  filename?: string;
  /** Optional label shown next to the icon. */
  label?: string;
}

type ExportState = "idle" | "capturing" | "rendering" | "done" | "error";

// ─── PDF layout constants ─────────────────────────────────────────────────────

const PDF = {
  format: "a4" as const,
  orientation: "landscape" as const,
  unit: "mm" as const,
  pageW: 297,   // mm — A4 landscape width
  pageH: 210,   // mm — A4 landscape height
  margin: 14,   // mm — uniform margin
  headerH: 28,  // mm — total header block height
  footerH: 10,  // mm — footer block height
  accentR: 0, accentG: 212, accentB: 255,   // --cyan #00d4ff
  bgR: 7,      bgG: 8,      bgB: 13,        // --bg   #07080d
  textR: 255,  textG: 255,  textB: 255,
  mutedR: 160, mutedG: 160, mutedB: 170,
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimestamp(date: Date): string {
  return date.toLocaleString("it-IT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Draws the InsightStream logo mark in PDF vector space. */
function drawLogoMark(
  doc: import("jspdf").jsPDF,
  x: number,
  y: number,
  size: number
): void {
  const barW = size * 0.18;
  const gap = size * 0.22;

  // Three rising bars
  const bars: Array<{ xOff: number; hFrac: number; opacity: number }> = [
    { xOff: 0,       hFrac: 0.5, opacity: 0.9 },
    { xOff: gap,     hFrac: 0.75, opacity: 0.7 },
    { xOff: gap * 2, hFrac: 1.0, opacity: 0.5 },
  ];

  for (const bar of bars) {
    const bh = size * bar.hFrac;
    doc.setFillColor(
      Math.round(PDF.accentR * bar.opacity),
      Math.round(PDF.accentG * bar.opacity),
      Math.round(PDF.accentB * bar.opacity)
    );
    doc.roundedRect(x + bar.xOff, y + (size - bh), barW, bh, 0.5, 0.5, "F");
  }

  // Trend line (amber)
  doc.setDrawColor(255, 140, 66);
  doc.setLineWidth(0.6);
  doc.line(x, y + size * 0.35, x + gap, y + size * 0.15);
  doc.line(x + gap, y + size * 0.15, x + gap * 2, y);
}

// ─── Core export function ─────────────────────────────────────────────────────

async function exportChartToPdf(
  targetId: string,
  filename: string,
  onStateChange: (s: ExportState) => void
): Promise<void> {
  // Dynamic imports — keeps initial bundle lean
  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import("jspdf"),
    import("html2canvas"),
  ]);

  // 1. Locate DOM element
  const element = document.getElementById(targetId);
  if (!element) {
    throw new Error(`Target element #${targetId} not found in DOM.`);
  }

  onStateChange("capturing");

  // 2. Capture with html2canvas
  const canvas = await html2canvas(element, {
    scale: 2,                  // retina quality
    useCORS: true,
    backgroundColor: "#07080d",
    logging: false,
    removeContainer: true,
    // Temporarily force full visibility for accurate capture
    onclone: (cloned) => {
      const el = cloned.getElementById(targetId);
      if (el) {
        (el as HTMLElement).style.maxHeight = "none";
        (el as HTMLElement).style.overflow = "visible";
        // Hide export button and any marked elements from the capture
        cloned.querySelectorAll("[data-export-hide]").forEach((node) => {
          (node as HTMLElement).style.display = "none";
        });
      }
    },
  });

  onStateChange("rendering");

  // 3. Initialise PDF
  const doc = new jsPDF({
    format: PDF.format,
    orientation: PDF.orientation,
    unit: PDF.unit,
  });

  const W = PDF.pageW;
  const H = PDF.pageH;
  const M = PDF.margin;
  const generatedAt = new Date();

  // ── Dark background ──────────────────────────────────────────────────────
  doc.setFillColor(PDF.bgR, PDF.bgG, PDF.bgB);
  doc.rect(0, 0, W, H, "F");

  // ── Subtle grid texture (thin lines) ─────────────────────────────────────
  doc.setDrawColor(255, 255, 255, 0.04);
  doc.setLineWidth(0.1);
  for (let gx = M; gx < W - M; gx += 20) {
    doc.line(gx, M, gx, H - M);
  }
  for (let gy = M; gy < H - M; gy += 20) {
    doc.line(M, gy, W - M, gy);
  }

  // ── Header block ─────────────────────────────────────────────────────────
  const headerY = M;

  // Logo mark (8mm square)
  drawLogoMark(doc, M, headerY, 8);

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(PDF.textR, PDF.textG, PDF.textB);
  doc.text("InsightStream", M + 12, headerY + 5.5);

  // Badge
  doc.setFillColor(PDF.accentR, PDF.accentG, PDF.accentB, 0.12);
  doc.roundedRect(M + 12, headerY + 7.5, 28, 4.5, 1, 1, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.setTextColor(PDF.accentR, PDF.accentG, PDF.accentB);
  doc.text("INSIGHTSTREAM REPORT", M + 13.5, headerY + 10.5);

  // Timestamp (top-right)
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(PDF.mutedR, PDF.mutedG, PDF.mutedB);
  doc.text(`Generato il ${formatTimestamp(generatedAt)}`, W - M, headerY + 5.5, {
    align: "right",
  });

  // Generated by line
  doc.setFontSize(6.5);
  doc.text("Powered by InsightStream AI · Eurostat Live Data", W - M, headerY + 10.5, {
    align: "right",
  });

  // ── Cyan accent divider ───────────────────────────────────────────────────
  const dividerY = headerY + PDF.headerH - 4;
  doc.setDrawColor(PDF.accentR, PDF.accentG, PDF.accentB);
  doc.setLineWidth(0.4);
  doc.line(M, dividerY, W - M, dividerY);

  // Fading extension (simulate gradient via overlapping segments)
  const fadeSteps = 12;
  const fadeLen = 40;
  for (let s = 0; s < fadeSteps; s++) {
    const opacity = 1 - s / fadeSteps;
    doc.setDrawColor(
      PDF.accentR,
      PDF.accentG,
      Math.round(PDF.accentB * opacity)
    );
    doc.setLineWidth(0.4 * opacity);
    doc.line(
      M + (W - 2 * M - fadeLen) + (s * fadeLen) / fadeSteps,
      dividerY,
      M + (W - 2 * M - fadeLen) + ((s + 1) * fadeLen) / fadeSteps,
      dividerY
    );
  }

  // ── Chart image ───────────────────────────────────────────────────────────
  const imageY = dividerY + 4;
  const availableW = W - 2 * M;
  const availableH = H - imageY - PDF.footerH - M;

  // Maintain aspect ratio
  const imgAspect = canvas.width / canvas.height;
  let imgW = availableW;
  let imgH = imgW / imgAspect;

  if (imgH > availableH) {
    imgH = availableH;
    imgW = imgH * imgAspect;
  }

  // Center horizontally
  const imgX = M + (availableW - imgW) / 2;

  // Subtle border around chart
  doc.setDrawColor(255, 255, 255, 0.08);
  doc.setLineWidth(0.3);
  doc.roundedRect(imgX - 1, imageY - 1, imgW + 2, imgH + 2, 2, 2);

  doc.addImage(
    canvas.toDataURL("image/png", 1.0),
    "PNG",
    imgX,
    imageY,
    imgW,
    imgH
  );

  // ── Footer ────────────────────────────────────────────────────────────────
  const footerY = H - M - 4;

  // Footer separator
  doc.setDrawColor(255, 255, 255, 0.08);
  doc.setLineWidth(0.2);
  doc.line(M, footerY - 2, W - M, footerY - 2);

  // Left: source attribution
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(PDF.mutedR, PDF.mutedG, PDF.mutedB);
  doc.text(
    "Fonte: Eurostat — European Statistical Office · insightstream.edoedoedo.it",
    M,
    footerY + 1.5
  );

  // Right: page number
  doc.text("Pagina 1 di 1", W - M, footerY + 1.5, { align: "right" });

  // ── Save ──────────────────────────────────────────────────────────────────
  const safeFilename = filename.replace(/[^a-zA-Z0-9_\-]/g, "_");
  doc.save(`${safeFilename}_${generatedAt.toISOString().slice(0, 10)}.pdf`);
}

// ─── State label map ──────────────────────────────────────────────────────────

const STATE_LABELS: Record<ExportState, string> = {
  idle: "Esporta PDF",
  capturing: "Acquisizione…",
  rendering: "Generazione…",
  done: "Scaricato",
  error: "Errore",
};

// ─── Component ────────────────────────────────────────────────────────────────

export function ExportButton({
  targetId,
  filename = "InsightStream_Report",
  label,
}: ExportButtonProps): React.ReactElement {
  const [state, setState] = useState<ExportState>("idle");

  const handleExport = useCallback(async () => {
    if (state !== "idle" && state !== "done" && state !== "error") return;

    setState("capturing");

    try {
      await exportChartToPdf(targetId, filename, setState);
      setState("done");
      // Reset to idle after 2.5 s
      setTimeout(() => setState("idle"), 2500);
    } catch (err) {
      console.error("[ExportButton] PDF generation failed:", err);
      setState("error");
      setTimeout(() => setState("idle"), 3000);
    }
  }, [state, targetId, filename]);

  const isLoading = state === "capturing" || state === "rendering";

  // Icon paths per state
  const iconPath: Record<ExportState, string> = {
    idle: "M4 14v4h8v-4M8 3v9M5 9l3 3 3-3",
    capturing: "M3 8h10M3 12h10M3 16h6",
    rendering: "M3 8h10M3 12h10M3 16h6",
    done: "M3 9l4 4 6-6",
    error: "M8 4v8M8 14v1",
  };

  const accentColor =
    state === "done"
      ? "#22d3a5"
      : state === "error"
      ? "#ff4d6d"
      : "#00d4ff";

  return (
    <motion.button
      onClick={handleExport}
      disabled={isLoading}
      aria-label={STATE_LABELS[state]}
      aria-busy={isLoading}
      whileHover={!isLoading ? { filter: "brightness(1.3)" } : undefined}
      whileTap={!isLoading ? { scale: 0.95 } : undefined}
      className="flex items-center gap-2 rounded-lg px-3 py-1.5 transition-all duration-200 disabled:cursor-wait"
      style={{
        background: `${accentColor}12`,
        border: `1px solid ${accentColor}28`,
        color: accentColor,
        fontSize: "11px",
        fontFamily: "'DM Mono', monospace",
        letterSpacing: "0.04em",
        minWidth: "fit-content",
      }}
    >
      {/* Animated icon */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.svg
          key={state}
          initial={{ opacity: 0, scale: 0.7, rotate: -10 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          exit={{ opacity: 0, scale: 0.7, rotate: 10 }}
          transition={{ duration: 0.2 }}
          width="13"
          height="13"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          {isLoading ? (
            <motion.circle
              cx="8"
              cy="8"
              r="5"
              stroke={accentColor}
              strokeWidth="1.5"
              strokeDasharray="16 16"
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 0.9, ease: "linear" }}
              style={{ originX: "50%", originY: "50%" }}
            />
          ) : (
            <path
              d={iconPath[state]}
              stroke={accentColor}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </motion.svg>
      </AnimatePresence>

      {/* Label */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={state}
          initial={{ opacity: 0, x: -4 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 4 }}
          transition={{ duration: 0.15 }}
        >
          {label ?? STATE_LABELS[state]}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}
