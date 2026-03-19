'use client';

/**
 * @file app/components/ai/EurostatChart.tsx (primitives: skeleton + error boundary)
 * @description Shared UI primitives: Skeleton + ErrorBoundary.
 * Used by EconomicChart and any future generative UI components.
 */

import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { motion } from 'framer-motion';

// ─── Loading skeleton ─────────────────────────────────────────────────────────

export function EuroChartSkeleton(): React.ReactElement {
    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="w-full rounded-xl border border-white/10 bg-[#0a0c12] p-6 space-y-4"
        >
            <div className="flex items-start justify-between">
                <div className="space-y-2">
                    <div className="h-3 w-20 rounded-sm bg-white/10 animate-pulse" />
                    <div className="h-5 w-48 rounded-sm bg-white/8 animate-pulse" />
                </div>
                <div className="h-7 w-24 rounded-md bg-white/6 animate-pulse" />
            </div>
            <div className="h-56 rounded-lg bg-white/4 animate-pulse flex items-end gap-2 px-4 pb-4">
                {[0.4, 0.7, 0.5, 0.9, 0.6, 0.8, 0.55, 0.75, 0.65, 0.85].map(
                    (h, i) => (
                        <div
                            key={i}
                            className="flex-1 rounded-sm bg-white/10 animate-pulse"
                            style={{
                                height: `${h * 100}%`,
                                animationDelay: `${i * 60}ms`,
                            }}
                        />
                    ),
                )}
            </div>
            <div className="grid grid-cols-3 gap-3">
                {[1, 2, 3].map((i) => (
                    <div
                        key={i}
                        className="h-14 rounded-lg bg-white/5 animate-pulse"
                    />
                ))}
            </div>
        </motion.div>
    );
}

// ─── Error boundary ───────────────────────────────────────────────────────────

interface ErrorBoundaryState {
    hasError: boolean;
    message: string;
}

export class EuroChartErrorBoundary extends Component<
    { children: ReactNode },
    ErrorBoundaryState
> {
    constructor(props: { children: ReactNode }) {
        super(props);
        this.state = { hasError: false, message: '' };
    }
    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, message: error.message };
    }
    componentDidCatch(error: Error, info: ErrorInfo): void {
        console.error('[Chart] Render error:', error, info.componentStack);
    }
    render(): ReactNode {
        if (this.state.hasError) {
            return (
                <div className="w-full rounded-xl border border-red-500/20 bg-red-950/20 px-6 py-5">
                    <p className="font-mono text-xs text-red-400/80 uppercase tracking-widest mb-1">
                        Errore di rendering
                    </p>
                    <p className="text-sm text-white/50">
                        {this.state.message}
                    </p>
                </div>
            );
        }
        return this.props.children;
    }
}
