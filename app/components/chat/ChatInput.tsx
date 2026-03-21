"use client";

/**
 * @file app/components/chat/ChatInput.tsx
 * @description Bottom-pinned chat input bar with auto-resize textarea.
 * Uses a form ref for programmatic submit — no more querySelector hacks.
 */

import { useRef, useState, useCallback, forwardRef, useImperativeHandle } from "react";
import { C } from "@/app/lib/design-tokens";

// ─── Public API for programmatic submit ───────────────────────────────────────

export interface ChatInputHandle {
  /** Focus the textarea */
  focus: () => void;
  /** Set the input value and optionally auto-submit */
  setAndSubmit: (value: string) => void;
  /** Set the input value without submitting */
  setValue: (value: string) => void;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface ChatInputProps {
  input:             string;
  isLoading:         boolean;
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleSubmit:      (e: React.FormEvent) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(
  function ChatInput({ input, isLoading, handleInputChange, handleSubmit }, ref) {
    const [inputFocused, setInputFocused] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const formRef     = useRef<HTMLFormElement>(null);

    // Expose imperative methods to parent
    useImperativeHandle(ref, () => ({
      focus: () => textareaRef.current?.focus(),

      setValue: (value: string) => {
        handleInputChange({
          target: { value },
        } as React.ChangeEvent<HTMLTextAreaElement>);
        textareaRef.current?.focus();
      },

      setAndSubmit: (value: string) => {
        handleInputChange({
          target: { value },
        } as React.ChangeEvent<HTMLTextAreaElement>);
        // requestSubmit needs to run after React processes the state update
        requestAnimationFrame(() => {
          formRef.current?.requestSubmit();
        });
      },
    }));

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          if (input.trim() && !isLoading) {
            handleSubmit(e as unknown as React.FormEvent);
          }
        }
      },
      [input, isLoading, handleSubmit],
    );

    return (
      <div
        className="fixed bottom-0 left-0 right-0 z-50"
        style={{
          background: `linear-gradient(to top, ${C.bg} 60%, transparent)`,
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <div className="max-w-3xl mx-auto px-4 pb-6 pt-8">
          <form ref={formRef} onSubmit={handleSubmit}>
            <div
              className="flex items-end gap-3 rounded-xl px-4 py-3 transition-all duration-200"
              style={{
                background: C.surface,
                border: `1px solid ${inputFocused ? `${C.cyan}35` : C.border}`,
                boxShadow: inputFocused
                  ? `0 0 0 3px ${C.cyan}08, 0 8px 32px rgba(0,0,0,0.4)`
                  : "0 8px 32px rgba(0,0,0,0.3)",
              }}
            >
              <textarea
                ref={textareaRef}
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
                  background:
                    input.trim() && !isLoading
                      ? `linear-gradient(135deg, ${C.cyan}30, ${C.cyan}15)`
                      : "transparent",
                  border: `1px solid ${
                    input.trim() && !isLoading ? `${C.cyan}40` : C.border
                  }`,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path
                    d="M7 12V2M2 7l5-5 5 5"
                    stroke={input.trim() && !isLoading ? C.cyan : C.muted}
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
            <p
              className="font-mono text-[9px] text-center mt-2.5 tracking-widest"
              style={{ color: "rgba(255,255,255,0.18)" }}
            >
              ENTER per inviare · SHIFT+ENTER per andare a capo
            </p>
            <p className="font-mono text-[8px] text-center mt-1.5 tracking-wider">
              <a
                href="https://www.edoedoedo.it/"
                target="_blank"
                rel="noopener noreferrer"
                className="italic line-through text-white/[0.12] hover:text-[#00d4ff] transition-colors"
              >
                EDOEDOEDO
              </a>
            </p>
          </form>
        </div>
      </div>
    );
  },
);

ChatInput.displayName = "ChatInput";
