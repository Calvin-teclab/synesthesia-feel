"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import ParticleField, {
  ParticleParams,
} from "@/components/ParticleField";
import SenseCard from "@/components/SenseCard";
import {
  BodyAnchor,
  EarAnchor,
  EyeAnchor,
  MindAnchor,
  NoseAnchor,
  Sense,
  TongueAnchor,
} from "@/lib/anchors";
import { playEar } from "@/lib/audio";

interface SenseHit<T> {
  sense: Sense;
  index: number;
  text: string;
  similarity: number;
  weight: number;
  anchor: T;
  candidates: { text: string; similarity: number }[];
}

interface ApiResult {
  input: string;
  signature: number[];
  hits: {
    eye: SenseHit<EyeAnchor>;
    ear: SenseHit<EarAnchor>;
    nose: SenseHit<NoseAnchor>;
    tongue: SenseHit<TongueAnchor>;
    body: SenseHit<BodyAnchor>;
    mind: SenseHit<MindAnchor>;
  };
}

const PRESETS = [
  "茉莉花茶",
  "雷雨夜里的孤独",
  "山涧清晨的第一缕风",
  "母亲煮粥时厨房的灯光",
  "佛前一盏酥油灯",
  "刚收到好消息时心跳的瞬间",
];

function hslCss(h: number, s: number, l: number, a = 1) {
  return `hsla(${((h % 360) + 360) % 360}, ${s}%, ${l}%, ${a})`;
}

export default function Page() {
  const [text, setText] = useState("");
  const [result, setResult] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const particleParams: ParticleParams | null = useMemo(() => {
    if (!result) return null;
    const { eye, mind, body, nose } = result.hits;
    return {
      hue: eye.anchor.hue,
      sat: eye.anchor.sat,
      light: eye.anchor.light,
      form: eye.anchor.form,
      turbulence: mind.anchor.turbulence,
      expansion: mind.anchor.scale,
      gravity: body.anchor.gravity,
      tremor: Math.min(2, body.anchor.tremor * 0.2),
      density: nose.anchor.density,
      signature: result.signature,
    };
  }, [result]);

  const accents: Record<Sense, string> = useMemo(() => {
    if (!result) {
      return {
        eye: "rgba(255,180,140,0.55)",
        ear: "rgba(160,210,255,0.55)",
        nose: "rgba(180,255,200,0.55)",
        tongue: "rgba(255,180,210,0.55)",
        body: "rgba(255,220,160,0.55)",
        mind: "rgba(200,180,255,0.55)",
      };
    }
    const eye = result.hits.eye.anchor;
    return {
      eye: hslCss(eye.hue, eye.sat, eye.light, 0.7),
      ear: hslCss(eye.hue + 60, eye.sat, eye.light + 8, 0.55),
      nose: hslCss(eye.hue + 120, eye.sat - 5, eye.light + 5, 0.55),
      tongue: hslCss(eye.hue + 180, eye.sat - 5, eye.light + 10, 0.55),
      body: hslCss(eye.hue + 240, eye.sat - 10, eye.light, 0.55),
      mind: hslCss(eye.hue + 300, eye.sat, eye.light + 12, 0.6),
    };
  }, [result]);

  const submit = useCallback(
    async (raw: string) => {
      const t = raw.trim();
      if (!t || loading) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/synesthesia", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: t }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Request failed");
        setResult(json);
        // Play the ear-anchor a beat after the orb starts to shift
        setTimeout(() => playEar(json.hits.ear.anchor), 250);
      } catch (e: any) {
        setError(e?.message || "出错了, 请稍后再试");
      } finally {
        setLoading(false);
      }
    },
    [loading],
  );

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submit(text);
  };

  const earHint = result && (
    <EarBars anchor={result.hits.ear.anchor} accent={accents.ear} />
  );
  const noseHint = result && (
    <NoseHint anchor={result.hits.nose.anchor} accent={accents.nose} />
  );
  const tongueHint = result && (
    <TongueHint anchor={result.hits.tongue.anchor} accent={accents.tongue} />
  );
  const bodyHint = result && (
    <BodyHint anchor={result.hits.body.anchor} accent={accents.body} />
  );
  const mindHint = result && (
    <MindHint anchor={result.hits.mind.anchor} accent={accents.mind} />
  );

  return (
    <main className="relative w-screen h-screen overflow-hidden">
      <div className="absolute inset-0 starfield pointer-events-none" />

      {/* Center particle field */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="relative w-[min(82vh,82vw)] h-[min(82vh,82vw)]">
          <ParticleField params={particleParams} />
          {/* Glow halo */}
          <div
            className="absolute inset-0 rounded-full glow-ring pointer-events-none"
            style={{
              boxShadow: result
                ? `0 0 140px 12px ${accents.eye}, inset 0 0 80px ${accents.eye}`
                : "0 0 80px 8px rgba(255,200,150,0.18), inset 0 0 60px rgba(255,200,150,0.12)",
            }}
          />
        </div>
      </div>

      {/* Title */}
      <header className="absolute top-6 left-0 right-0 text-center pointer-events-none z-10">
        <h1 className="font-zen text-2xl sm:text-3xl tracking-[0.45em] text-white/85">
          六　根
        </h1>
        <p className="mt-1 text-[11px] sm:text-xs text-white/45 tracking-[0.3em]">
          ŚAḌ INDRIYĀṆI · A SYNESTHESIA ENGINE
        </p>
        <p className="mt-3 text-[11px] sm:text-xs text-white/40 max-w-[680px] mx-auto px-6 leading-relaxed">
          一句话, 一个字, 都会被 embedding 投射到同一个高维空间——
          就像神经里的联觉, 把眼耳鼻舌身意彼此唤醒.
        </p>
      </header>

      {/* Left column */}
      <div className="absolute left-4 sm:left-8 top-0 bottom-0 flex flex-col justify-center gap-4 z-10 pointer-events-auto">
        <SenseCard
          sense="eye"
          index={0}
          loading={loading}
          accent={accents.eye}
          text={result?.hits.eye.text ?? null}
          similarity={result?.hits.eye.similarity ?? null}
          candidates={result?.hits.eye.candidates}
          hint={
            result && (
              <div className="flex items-center gap-2">
                <span
                  className="w-4 h-4 rounded-full border border-white/20"
                  style={{
                    background: hslCss(
                      result.hits.eye.anchor.hue,
                      result.hits.eye.anchor.sat,
                      result.hits.eye.anchor.light,
                    ),
                  }}
                />
                <span className="text-[10px] text-white/40 uppercase tracking-[0.18em]">
                  {result.hits.eye.anchor.form}
                </span>
              </div>
            )
          }
        />
        <SenseCard
          sense="ear"
          index={1}
          loading={loading}
          accent={accents.ear}
          text={result?.hits.ear.text ?? null}
          similarity={result?.hits.ear.similarity ?? null}
          candidates={result?.hits.ear.candidates}
          hint={earHint}
        />
        <SenseCard
          sense="nose"
          index={2}
          loading={loading}
          accent={accents.nose}
          text={result?.hits.nose.text ?? null}
          similarity={result?.hits.nose.similarity ?? null}
          candidates={result?.hits.nose.candidates}
          hint={noseHint}
        />
      </div>

      {/* Right column */}
      <div className="absolute right-4 sm:right-8 top-0 bottom-0 flex flex-col justify-center gap-4 z-10 pointer-events-auto">
        <SenseCard
          sense="tongue"
          index={3}
          loading={loading}
          accent={accents.tongue}
          text={result?.hits.tongue.text ?? null}
          similarity={result?.hits.tongue.similarity ?? null}
          candidates={result?.hits.tongue.candidates}
          hint={tongueHint}
        />
        <SenseCard
          sense="body"
          index={4}
          loading={loading}
          accent={accents.body}
          text={result?.hits.body.text ?? null}
          similarity={result?.hits.body.similarity ?? null}
          candidates={result?.hits.body.candidates}
          hint={bodyHint}
        />
        <SenseCard
          sense="mind"
          index={5}
          loading={loading}
          accent={accents.mind}
          text={result?.hits.mind.text ?? null}
          similarity={result?.hits.mind.similarity ?? null}
          candidates={result?.hits.mind.candidates}
          hint={mindHint}
        />
      </div>

      {/* Bottom input */}
      <div className="absolute left-0 right-0 bottom-6 flex flex-col items-center gap-3 z-20 px-6">
        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-xs text-rose-300"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        <form
          onSubmit={onSubmit}
          className="flex items-center gap-2 w-full max-w-[560px]"
        >
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="输入一个字, 一句诗, 一段情绪……"
            maxLength={500}
            className="zen-input flex-1 rounded-full px-5 py-3 text-sm"
          />
          <button
            type="submit"
            disabled={loading || !text.trim()}
            className="rounded-full px-5 py-3 text-sm text-white/90 transition-all disabled:opacity-40"
            style={{
              background: result
                ? `linear-gradient(135deg, ${accents.eye}, ${accents.mind})`
                : "linear-gradient(135deg, rgba(255,220,180,0.35), rgba(200,180,255,0.35))",
              boxShadow: result
                ? `0 0 24px -4px ${accents.eye}`
                : "0 0 18px -4px rgba(255,220,180,0.35)",
            }}
          >
            {loading ? "感知中…" : "起一念"}
          </button>
        </form>

        <div className="flex flex-wrap items-center justify-center gap-2 max-w-[680px]">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                setText(p);
                submit(p);
              }}
              disabled={loading}
              className="text-[11px] px-3 py-1 rounded-full border border-white/10 text-white/55 hover:text-white hover:border-white/30 transition-colors disabled:opacity-40"
            >
              {p}
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}

/* ---------- small per-sense visual hints ---------- */

function EarBars({ anchor, accent }: { anchor: EarAnchor; accent: string }) {
  const bars = useMemo(() => {
    const seed = anchor.freq * anchor.harmonic;
    return Array.from({ length: 18 }, (_, i) => {
      const v =
        0.3 +
        0.7 *
          Math.abs(
            Math.sin(seed * 0.01 + i * (anchor.waveform === "sawtooth" ? 0.9 : 0.5)),
          );
      return v;
    });
  }, [anchor]);

  return (
    <div className="flex items-end gap-[3px] h-8">
      {bars.map((v, i) => (
        <motion.span
          key={i}
          initial={{ scaleY: 0.3 }}
          animate={{ scaleY: [v * 0.4, v, v * 0.4] }}
          transition={{
            duration: 1.6 + (i % 3) * 0.2,
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * 0.03,
          }}
          style={{
            background: accent,
            transformOrigin: "bottom",
            width: 4,
            height: `${4 + v * 24}px`,
            borderRadius: 2,
            opacity: 0.85,
          }}
        />
      ))}
    </div>
  );
}

function NoseHint({ anchor, accent }: { anchor: NoseAnchor; accent: string }) {
  const motions: Record<NoseAnchor["motion"], string> = {
    rise: "↑ 缓缓升腾",
    swirl: "↻ 旋转盘绕",
    settle: "↓ 沉淀下落",
    radiate: "✶ 向外辐散",
    drift: "～ 随风飘移",
  };
  return (
    <div className="flex items-center gap-2">
      <div className="relative w-14 h-6 overflow-hidden rounded">
        {[0, 1, 2, 3].map((i) => (
          <motion.span
            key={i}
            className="absolute bottom-0 w-1.5 h-1.5 rounded-full"
            style={{ background: accent, left: `${10 + i * 14}%` }}
            animate={{
              y: [-2, -22, -2],
              opacity: [0, 0.9, 0],
            }}
            transition={{
              duration: 2.2 + i * 0.3,
              repeat: Infinity,
              delay: i * 0.4,
              ease: "easeOut",
            }}
          />
        ))}
      </div>
      <span className="text-[10px] text-white/45">{motions[anchor.motion]}</span>
    </div>
  );
}

function TongueHint({
  anchor,
  accent,
}: {
  anchor: TongueAnchor;
  accent: string;
}) {
  const tempLabel =
    anchor.temperature > 0.5
      ? "热"
      : anchor.temperature > 0
        ? "温"
        : anchor.temperature > -0.5
          ? "凉"
          : "冷";
  const edgeLabel = anchor.edge > 0.6 ? "锐" : anchor.edge > 0.3 ? "和" : "润";
  return (
    <div className="flex items-center gap-3">
      <div className="text-[10px] text-white/45">
        温 <span className="text-white/75">{tempLabel}</span>
      </div>
      <div className="h-3 w-20 rounded-full bg-white/8 overflow-hidden relative">
        <div
          className="absolute top-0 bottom-0"
          style={{
            left: `${50 + anchor.temperature * 50 - 4}%`,
            width: 8,
            background: accent,
            borderRadius: 9999,
            boxShadow: `0 0 8px ${accent}`,
          }}
        />
      </div>
      <div className="text-[10px] text-white/45">
        味 <span className="text-white/75">{edgeLabel}</span>
      </div>
    </div>
  );
}

function BodyHint({ anchor, accent }: { anchor: BodyAnchor; accent: string }) {
  return (
    <div className="flex items-center gap-3">
      <motion.div
        className="w-3 h-3 rounded-full"
        style={{ background: accent }}
        animate={{
          x: [-2, 2, -2],
          y: [0, anchor.gravity * 8, 0],
        }}
        transition={{
          duration: Math.max(0.15, 1.4 / Math.max(0.3, anchor.tremor)),
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
      <span className="text-[10px] text-white/45">
        颤 <span className="text-white/75">{anchor.tremor.toFixed(1)}</span>
        　重 <span className="text-white/75">{anchor.gravity.toFixed(2)}</span>
      </span>
    </div>
  );
}

function MindHint({ anchor, accent }: { anchor: MindAnchor; accent: string }) {
  return (
    <div className="flex items-center gap-3">
      <motion.div
        className="w-6 h-6 rounded-full border"
        style={{ borderColor: accent }}
        animate={{
          scale: [
            1 - Math.max(0, -anchor.scale) * 0.3,
            1 + Math.max(0, anchor.scale) * 0.4,
            1 - Math.max(0, -anchor.scale) * 0.3,
          ],
          rotate: anchor.turbulence > 0.5 ? [0, 360] : [0, 8, -8, 0],
        }}
        transition={{
          duration: anchor.turbulence > 0.5 ? 3.0 : 4.2,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
      <span className="text-[10px] text-white/45">
        澜 <span className="text-white/75">{anchor.turbulence.toFixed(2)}</span>
        　势 <span className="text-white/75">{anchor.scale.toFixed(2)}</span>
      </span>
    </div>
  );
}
