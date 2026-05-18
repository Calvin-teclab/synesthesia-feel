"use client";

import { motion } from "framer-motion";
import { Sense, senseLabels } from "@/lib/anchors";

export interface SenseCardProps {
  sense: Sense;
  text: string | null;
  similarity: number | null;
  candidates?: { text: string; similarity: number }[];
  /** A hex/HSL accent color for the card */
  accent?: string;
  /** 0..1 visual position around the mandala */
  index: number;
  /** Whether the result is loading */
  loading?: boolean;
  /** Side hint for the small visual */
  hint?: React.ReactNode;
}

export default function SenseCard({
  sense,
  text,
  similarity,
  candidates,
  accent = "rgba(255,200,150,0.55)",
  index,
  loading,
  hint,
}: SenseCardProps) {
  const label = senseLabels[sense];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.08 * index, ease: "easeOut" }}
      className="glass rounded-2xl p-4 w-[280px] sm:w-[300px] relative overflow-hidden"
      style={{ boxShadow: `0 0 32px -8px ${accent}` }}
    >
      <div
        className="absolute -top-12 -right-10 w-32 h-32 rounded-full opacity-40 blur-2xl pointer-events-none"
        style={{ background: accent }}
      />
      <div className="flex items-baseline gap-2">
        <span
          className="text-3xl font-zen leading-none"
          style={{ color: accent }}
        >
          {label.zh}
        </span>
        <span className="text-[10px] uppercase tracking-[0.2em] text-white/40">
          {label.sk}
        </span>
        <span className="text-xs text-white/45 ml-auto">{label.gloss}</span>
      </div>

      <div className="mt-3 min-h-[3.4rem]">
        {loading ? (
          <div className="space-y-2">
            <div className="h-3 rounded bg-white/10 animate-pulse w-3/4" />
            <div className="h-3 rounded bg-white/10 animate-pulse w-1/2" />
          </div>
        ) : text ? (
          <p className="text-[15px] leading-relaxed text-white/85">{text}</p>
        ) : (
          <p className="text-sm text-white/30 italic">
            待你的一念落下，{label.zh}根将自显。
          </p>
        )}
      </div>

      {hint && <div className="mt-3">{hint}</div>}

      {similarity !== null && !loading && (
        <div className="mt-3 flex items-center gap-2">
          <div className="h-[3px] flex-1 rounded-full bg-white/8 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${Math.max(2, Math.min(100, similarity * 100))}%`,
                background: accent,
              }}
            />
          </div>
          <span className="text-[10px] tabular-nums text-white/40">
            {(similarity * 100).toFixed(0)}
          </span>
        </div>
      )}

      {candidates && candidates.length > 1 && !loading && (
        <details className="mt-3 group">
          <summary className="text-[10px] uppercase tracking-[0.2em] text-white/35 cursor-pointer hover:text-white/60">
            另外的可能
          </summary>
          <ul className="mt-2 space-y-1">
            {candidates.slice(1).map((c, i) => (
              <li key={i} className="text-xs text-white/45">
                · {c.text}
                <span className="ml-1 text-white/25">
                  {(c.similarity * 100).toFixed(0)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </motion.div>
  );
}
