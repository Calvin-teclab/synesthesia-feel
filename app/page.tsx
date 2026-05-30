"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  senseLabels,
  TongueAnchor,
} from "@/lib/anchors";
import { playEar } from "@/lib/audio";
import type { EmbeddingProvider } from "@/lib/ark";

type InputMode = "text" | "image";
type WorkbenchTab = "map" | "eval" | "blend";

interface SenseHit<T> {
  sense: Sense;
  index: number;
  text: string;
  similarity: number;
  weight: number;
  blend: T;
  anchor: T;
  candidates: { text: string; similarity: number; weight: number }[];
}

interface ApiResult {
  input: string;
  inputType: InputMode;
  provider: EmbeddingProvider;
  model: string;
  signature: number[];
  profile: number[];
  vector: {
    dimensions: number;
    shownDimensions: number;
    l2Norm: number;
    meanAbs: number;
    min: number;
    max: number;
    sample: { index: number; value: number; normalized: number }[];
    strongest: { index: number; value: number; normalized: number }[];
  };
  map: {
    method: "anchor-pca";
    points: {
      id: string;
      type: "anchor" | "input";
      sense?: Sense;
      label: string;
      x: number;
      y: number;
      similarity?: number;
      rank?: number;
    }[];
  };
  hits: {
    eye: SenseHit<EyeAnchor>;
    ear: SenseHit<EarAnchor>;
    nose: SenseHit<NoseAnchor>;
    tongue: SenseHit<TongueAnchor>;
    body: SenseHit<BodyAnchor>;
    mind: SenseHit<MindAnchor>;
  };
}

interface EvaluationResult {
  generatedAt: string;
  sampleCount: number;
  metrics: {
    recallAt1: number;
    recallAt3: number;
    mrr: number;
    avgTop1Margin: number;
    avgSoftmaxEntropy: number;
    anchorDistributionEntropy: number;
  };
  bySense: Record<
    Sense,
    {
      count: number;
      recallAt1: number;
      recallAt3: number;
      avgRank: number;
    }
  >;
  cases: {
    id: string;
    text: string;
    sense: Sense;
    expected: string;
    rank: number;
    margin: number;
    entropy: number;
    top3: { text: string; similarity: number }[];
  }[];
}

const PRESETS = [
  "茉莉花茶",
  "雷雨夜里的孤独",
  "山涧清晨的第一缕风",
  "母亲煮粥时厨房的灯光",
  "佛前一盏酥油灯",
  "刚收到好消息时心跳的瞬间",
];

const PROVIDERS: { id: EmbeddingProvider; label: string }[] = [
  { id: "ark", label: "火山引擎" },
  { id: "gemini", label: "Gemini" },
];

function hslCss(h: number, s: number, l: number, a = 1) {
  return `hsla(${((h % 360) + 360) % 360}, ${s}%, ${l}%, ${a})`;
}

export default function Page() {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<InputMode>("text");
  const [embeddingProvider, setEmbeddingProvider] =
    useState<EmbeddingProvider>("ark");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string | null>(null);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workbenchTab, setWorkbenchTab] = useState<WorkbenchTab>("map");
  const [evalResult, setEvalResult] = useState<EvaluationResult | null>(null);
  const [evalLoading, setEvalLoading] = useState(false);
  const [evalError, setEvalError] = useState<string | null>(null);
  const [providerModels, setProviderModels] = useState<
    Partial<Record<EmbeddingProvider, string>>
  >({});
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const particleParams: ParticleParams | null = useMemo(() => {
    if (!result) return null;
    const { eye, mind, body, nose } = result.hits;
    return {
      hue: eye.blend.hue,
      sat: eye.blend.sat,
      light: eye.blend.light,
      form: eye.blend.form,
      turbulence: mind.blend.turbulence,
      expansion: mind.blend.scale,
      gravity: body.blend.gravity,
      tremor: Math.min(2, body.blend.tremor * 0.2),
      density: nose.blend.density,
      signature: result.signature,
      profile: result.profile,
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
    const eye = result.hits.eye.blend;
    return {
      eye: hslCss(eye.hue, eye.sat, eye.light, 0.7),
      ear: hslCss(eye.hue + 60, eye.sat, eye.light + 8, 0.55),
      nose: hslCss(eye.hue + 120, eye.sat - 5, eye.light + 5, 0.55),
      tongue: hslCss(eye.hue + 180, eye.sat - 5, eye.light + 10, 0.55),
      body: hslCss(eye.hue + 240, eye.sat - 10, eye.light, 0.55),
      mind: hslCss(eye.hue + 300, eye.sat, eye.light + 12, 0.6),
    };
  }, [result]);

  const playCurrentEar = useCallback(() => {
    if (!result?.hits.ear.blend) return;
    playEar(result.hits.ear.blend);
  }, [result]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/embedding-config", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled && json?.providers) {
          setProviderModels(json.providers);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const selectEmbeddingProvider = useCallback(
    (provider: EmbeddingProvider) => {
      setEmbeddingProvider(provider);
      setEvalResult(null);
      setEvalError(null);
      setError(null);
    },
    [],
  );

  const runEvaluation = useCallback(async () => {
    if (evalLoading) return;
    setEvalLoading(true);
    setEvalError(null);
    try {
      const res = await fetch(
        `/api/embedding-eval?provider=${embeddingProvider}`,
        { cache: "no-store" },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Evaluation failed");
      setEvalResult(json);
    } catch (e: any) {
      setEvalError(e?.message || "评测运行失败");
    } finally {
      setEvalLoading(false);
    }
  }, [embeddingProvider, evalLoading]);

  const submit = useCallback(
    async (raw?: string, nextMode = mode) => {
      const t = (raw ?? text).trim();
      if (loading) return;
      if (nextMode === "text" && !t) return;
      if (nextMode === "image" && !imageDataUrl) {
        setError("请先上传一张图片");
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/synesthesia", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            nextMode === "image"
              ? { mode: "image", imageDataUrl, provider: embeddingProvider }
              : { mode: "text", text: t, provider: embeddingProvider },
          ),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Request failed");
        setResult(json);
        setWorkbenchTab("map");
        if (nextMode === "image") {
          setImageDataUrl(null);
          setImageName(null);
          if (fileRef.current) fileRef.current.value = "";
        }
        // Play the ear-anchor a beat after the orb starts to shift
        setTimeout(() => playEar(json.hits.ear.blend), 250);
      } catch (e: any) {
        setError(e?.message || "出错了, 请稍后再试");
      } finally {
        setLoading(false);
      }
    },
    [embeddingProvider, imageDataUrl, loading, mode, text],
  );

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submit(text);
  };

  const handleImage = (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
      setError("请上传 PNG、JPG 或 WebP 图片");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setError("图片太大了, 请控制在 4MB 以内");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      setImageDataUrl(reader.result);
      setImageName(file.name);
      setError(null);
    };
    reader.onerror = () => setError("图片读取失败, 请换一张试试");
    reader.readAsDataURL(file);
  };

  const earHint = result && (
    <EarBars anchor={result.hits.ear.blend} accent={accents.ear} />
  );
  const noseHint = result && (
    <NoseHint anchor={result.hits.nose.blend} accent={accents.nose} />
  );
  const tongueHint = result && (
    <TongueHint anchor={result.hits.tongue.blend} accent={accents.tongue} />
  );
  const bodyHint = result && (
    <BodyHint anchor={result.hits.body.blend} accent={accents.body} />
  );
  const mindHint = result && (
    <MindHint anchor={result.hits.mind.blend} accent={accents.mind} />
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

      <div className="pointer-events-none absolute left-1/2 top-[58%] z-10 w-[min(520px,58vw)] -translate-x-1/2 -translate-y-1/2">
        <EmbeddingWorkbench
          result={result}
          loading={loading}
          accent={accents.mind}
          activeTab={workbenchTab}
          onTabChange={setWorkbenchTab}
          evalResult={evalResult}
          evalLoading={evalLoading}
          evalError={evalError}
          onRunEval={runEvaluation}
        />
      </div>

      {/* Title */}
      <header className="absolute top-6 left-0 right-0 text-center pointer-events-none z-10">
        <h1 className="font-zen text-2xl sm:text-3xl tracking-[0.45em] text-white/85">
          联觉通感
        </h1>
        <p className="mt-1 text-[11px] sm:text-xs text-white/45 tracking-[0.3em]">
          SYNESTHESIA ENGINE
        </p>
        <p className="mt-3 text-[11px] sm:text-xs text-white/40 max-w-[680px] mx-auto px-6 leading-relaxed">
          一句话, 一个字, 都会被 embedding 投射到同一个高维空间——
          就像神经里的联觉, 把眼耳鼻舌身意彼此唤醒.
        </p>
      </header>

      <div className="absolute right-4 top-4 z-30 flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-2 py-1.5 shadow-[0_16px_48px_rgba(0,0,0,0.28)] backdrop-blur-md sm:right-6 sm:top-6">
        <span className="hidden pl-2 text-[10px] uppercase tracking-[0.22em] text-white/35 sm:inline">
          模型
        </span>
        <div className="flex rounded-full bg-white/[0.04] p-1">
          {PROVIDERS.map((provider) => (
            <span key={provider.id} className="group relative">
              <button
                type="button"
                onClick={() => selectEmbeddingProvider(provider.id)}
                aria-label={`${provider.label} 模型：${
                  providerModels[provider.id] ?? "读取模型配置中"
                }`}
                className={`rounded-full px-3 py-1.5 text-[10px] tracking-[0.14em] transition sm:px-3.5 ${
                  embeddingProvider === provider.id
                    ? "bg-white/[0.14] text-white shadow-[0_0_18px_rgba(255,255,255,0.08)]"
                    : "text-white/42 hover:text-white/76"
                }`}
              >
                {provider.label}
              </button>
              <span className="pointer-events-none absolute left-1/2 top-full z-40 mt-3 -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/10 bg-black/72 px-3 py-2 text-[10px] tracking-[0.12em] text-white/72 opacity-0 shadow-[0_16px_44px_rgba(0,0,0,0.38)] backdrop-blur-md transition duration-150 group-hover:translate-y-0 group-hover:opacity-100">
                <span className="text-white/38">{provider.label}</span>
                <span className="mx-1.5 text-white/20">/</span>
                <span>{providerModels[provider.id] ?? "读取模型配置中"}</span>
              </span>
            </span>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            className="absolute right-4 top-20 z-30 max-w-[360px] rounded-lg border border-rose-300/20 bg-rose-950/35 px-4 py-3 text-xs leading-relaxed text-rose-100 shadow-[0_18px_52px_rgba(0,0,0,0.34)] backdrop-blur-md sm:right-6"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

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
                      result.hits.eye.blend.hue,
                      result.hits.eye.blend.sat,
                      result.hits.eye.blend.light,
                    ),
                  }}
                />
                <span className="text-[10px] text-white/40 uppercase tracking-[0.18em]">
                  {result.hits.eye.blend.form}
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
          action={
            result && (
              <button
                type="button"
                onClick={playCurrentEar}
                className="grid h-6 w-6 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-[10px] text-white/70 transition hover:border-white/25 hover:bg-white/[0.08] hover:text-white"
                aria-label="播放耳根声音"
                title="播放耳根声音"
              >
                ▶
              </button>
            )
          }
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
        <div className="flex rounded-full border border-white/10 bg-black/25 p-1 backdrop-blur-md">
          {(["text", "image"] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => {
                setMode(item);
                setError(null);
              }}
              className={`rounded-full px-4 py-1.5 text-[11px] tracking-[0.18em] transition ${
                mode === item
                  ? "bg-white/[0.12] text-white shadow-[0_0_18px_rgba(255,255,255,0.08)]"
                  : "text-white/40 hover:text-white/70"
              }`}
            >
              {item === "text" ? "文字" : "图片"}
            </button>
          ))}
        </div>

        <form
          onSubmit={onSubmit}
          className="flex items-center gap-2 w-full max-w-[560px]"
        >
          {mode === "text" ? (
            <input
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="输入一个字, 一句诗, 一段情绪……"
              maxLength={500}
              className="zen-input flex-1 rounded-full px-5 py-3 text-sm"
            />
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="zen-input flex min-w-0 flex-1 items-center gap-3 rounded-full px-4 py-2 text-left text-sm transition hover:border-white/25"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full border border-white/10 bg-white/[0.04] text-white/50">
                {imageDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imageDataUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  "＋"
                )}
              </span>
              <span className="min-w-0 flex-1 truncate text-white/65">
                {imageName ??
                  (result?.inputType === "image"
                    ? "再上传一张图片，生成新的高维向量"
                    : "上传一张图片，让它转成通感体验")}
              </span>
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => handleImage(e.target.files?.[0])}
          />
          <button
            type="submit"
            disabled={
              loading ||
              (mode === "text" ? !text.trim() : imageDataUrl === null)
            }
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
                setMode("text");
                setText(p);
                submit(p, "text");
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

/* ---------- embedding interview workbench ---------- */

const SENSE_ORDER: Sense[] = ["eye", "ear", "nose", "tongue", "body", "mind"];

const WORKBENCH_TABS: { id: WorkbenchTab; label: string }[] = [
  { id: "map", label: "MAP" },
  { id: "eval", label: "EVAL" },
  { id: "blend", label: "TOP-K" },
];

const SENSE_COLORS: Record<Sense, string> = {
  eye: "rgba(255, 151, 109, 0.92)",
  ear: "rgba(123, 205, 255, 0.92)",
  nose: "rgba(136, 235, 174, 0.92)",
  tongue: "rgba(255, 139, 193, 0.92)",
  body: "rgba(255, 211, 127, 0.92)",
  mind: "rgba(190, 157, 255, 0.92)",
};

function pct(value: number) {
  return `${Math.round(value * 100)}%`;
}

function trimText(value: string, max = 12) {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function EmbeddingWorkbench({
  result,
  loading,
  accent,
  activeTab,
  onTabChange,
  evalResult,
  evalLoading,
  evalError,
  onRunEval,
}: {
  result: ApiResult | null;
  loading: boolean;
  accent: string;
  activeTab: WorkbenchTab;
  onTabChange: (tab: WorkbenchTab) => void;
  evalResult: EvaluationResult | null;
  evalLoading: boolean;
  evalError: string | null;
  onRunEval: () => void;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: result || loading ? 1 : 0.58, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="pointer-events-auto w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white/70 shadow-[0_18px_60px_rgba(0,0,0,0.32)] backdrop-blur-md"
      style={{ boxShadow: result ? `0 0 34px -16px ${accent}` : undefined }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.26em] text-white/38">
            Embedding Lab
          </div>
          <div className="mt-1 font-zen text-base text-white/85">
            {activeTab === "map"
              ? "Anchor 向量地图"
              : activeTab === "eval"
                ? "检索评测"
                : "Top-1 / Top-k 对照"}
          </div>
        </div>
        <div className="flex rounded-full border border-white/10 bg-white/[0.035] p-1">
          {WORKBENCH_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={`rounded-full px-2.5 py-1 text-[9px] tracking-[0.18em] transition ${
                activeTab === tab.id
                  ? "bg-white/[0.12] text-white"
                  : "text-white/38 hover:text-white/70"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "map" && (
        <EmbeddingMapPanel result={result} loading={loading} accent={accent} />
      )}
      {activeTab === "eval" && (
        <EvaluationPanel
          evalResult={evalResult}
          evalLoading={evalLoading}
          evalError={evalError}
          onRunEval={onRunEval}
        />
      )}
      {activeTab === "blend" && <BlendPanel result={result} loading={loading} />}
    </motion.section>
  );
}

function EmbeddingMapPanel({
  result,
  loading,
  accent,
}: {
  result: ApiResult | null;
  loading: boolean;
  accent: string;
}) {
  const samples = result?.vector.sample.slice(0, 40) ?? [];
  const strongest = result?.vector.strongest.slice(0, 3) ?? [];

  return (
    <div className="mt-3">
      <div className="relative h-40 overflow-hidden rounded-lg border border-white/8 bg-white/[0.035]">
        <div className="absolute left-1/2 top-3 bottom-3 w-px bg-white/8" />
        <div className="absolute left-3 right-3 top-1/2 h-px bg-white/8" />
        {result?.map.points.map((point) => {
          const isInput = point.type === "input";
          const isNear = typeof point.rank === "number" && point.rank <= 6;
          const color =
            point.type === "anchor" && point.sense
              ? SENSE_COLORS[point.sense]
              : accent;
          const size = isInput ? 16 : isNear ? 9 : 5;

          return (
            <span
              key={point.id}
              className="absolute"
              style={{
                left: `${50 + point.x * 40}%`,
                top: `${50 - point.y * 40}%`,
                transform: "translate(-50%, -50%)",
              }}
            >
              <span
                className={`block rounded-full ${
                  isInput ? "border border-white/80" : "border border-white/15"
                }`}
                title={`${point.label}${
                  point.similarity ? ` · ${point.similarity.toFixed(4)}` : ""
                }`}
                style={{
                  width: size,
                  height: size,
                  background: color,
                  opacity: isInput ? 1 : isNear ? 0.95 : 0.38,
                  boxShadow: isInput || isNear ? `0 0 16px ${color}` : undefined,
                }}
              />
              {(isInput || (point.rank && point.rank <= 3)) && (
                <span
                  className="absolute left-3 top-[-6px] whitespace-nowrap rounded-full border border-white/10 bg-black/55 px-1.5 py-0.5 text-[9px] text-white/66 backdrop-blur"
                  style={{ color: isInput ? "rgba(255,255,255,0.9)" : color }}
                >
                  {isInput ? "INPUT" : `#${point.rank} ${trimText(point.label, 8)}`}
                </span>
              )}
            </span>
          );
        })}
        {!result && (
          <div className="flex h-full items-center justify-center text-[11px] tracking-[0.2em] text-white/24">
            {loading ? "正在投影向量空间" : "等待一次起念"}
          </div>
        )}
      </div>

      <div className="relative mt-3 h-12 overflow-hidden rounded-lg border border-white/8 bg-white/[0.035]">
        <div className="absolute left-0 right-0 top-1/2 h-px bg-white/12" />
        {samples.length > 0 ? (
          <div className="grid h-full grid-cols-[repeat(40,minmax(0,1fr))] items-center gap-[2px] px-2">
            {samples.map((item) => {
              const height = 4 + Math.abs(item.normalized) * 20;
              const positive = item.value >= 0;
              return (
                <span
                  key={item.index}
                  title={`d${item.index}: ${item.value.toFixed(6)}`}
                  className="relative block h-full"
                >
                  <span
                    className="absolute left-0 right-0 mx-auto block w-full rounded-full"
                    style={{
                      height,
                      bottom: positive ? "50%" : undefined,
                      top: positive ? undefined : "50%",
                      background: positive
                        ? accent
                        : "rgba(118, 214, 255, 0.78)",
                      boxShadow: `0 0 10px ${
                        positive ? accent : "rgba(118,214,255,0.55)"
                      }`,
                    }}
                  />
                </span>
              );
            })}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-[11px] tracking-[0.2em] text-white/24">
            {loading ? "正在等待真实向量返回" : "未生成前不显示模拟数据"}
          </div>
        )}
      </div>

      <div className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 text-[10px] text-white/38">
        <span className="shrink-0">
          {result
            ? `${result.provider === "gemini" ? "Gemini" : "火山引擎"} · ${result.vector.dimensions}D · 均幅 ${result.vector.meanAbs.toFixed(4)}`
            : "Anchor PCA + 当前输入投影"}
        </span>
        {strongest.length > 0 && (
          <span className="min-w-0 truncate text-right tabular-nums">
            strongest{" "}
            {strongest
              .map((item) => `d${item.index} ${item.value.toFixed(4)}`)
              .join(" · ")}
          </span>
        )}
      </div>
    </div>
  );
}

function EvaluationPanel({
  evalResult,
  evalLoading,
  evalError,
  onRunEval,
}: {
  evalResult: EvaluationResult | null;
  evalLoading: boolean;
  evalError: string | null;
  onRunEval: () => void;
}) {
  const hardCases =
    evalResult?.cases
      .slice()
      .sort((a, b) => b.rank - a.rank || a.margin - b.margin)
      .slice(0, 6) ?? [];

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[10px] uppercase tracking-[0.2em] text-white/38">
          {evalResult ? `${evalResult.sampleCount} samples` : "on-demand batch"}
        </div>
        <button
          type="button"
          onClick={onRunEval}
          disabled={evalLoading}
          className="rounded-full border border-white/10 bg-white/[0.055] px-3 py-1.5 text-[10px] tracking-[0.14em] text-white/68 transition hover:border-white/25 hover:text-white disabled:opacity-40"
        >
          {evalLoading ? "RUNNING" : evalResult ? "RERUN" : "RUN EVAL"}
        </button>
      </div>

      {evalError && <div className="mt-2 text-xs text-rose-300">{evalError}</div>}

      {evalResult ? (
        <>
          <div className="mt-3 grid grid-cols-5 gap-2">
            <MetricPill label="R@1" value={pct(evalResult.metrics.recallAt1)} />
            <MetricPill label="R@3" value={pct(evalResult.metrics.recallAt3)} />
            <MetricPill label="MRR" value={evalResult.metrics.mrr.toFixed(2)} />
            <MetricPill
              label="Margin"
              value={evalResult.metrics.avgTop1Margin.toFixed(3)}
            />
            <MetricPill
              label="Entropy"
              value={evalResult.metrics.avgSoftmaxEntropy.toFixed(2)}
            />
          </div>

          <div className="mt-3 grid grid-cols-6 gap-1.5">
            {SENSE_ORDER.map((sense) => (
              <div
                key={sense}
                className="rounded-md border border-white/8 bg-white/[0.03] px-2 py-1.5 text-center"
              >
                <div
                  className="font-zen text-sm"
                  style={{ color: SENSE_COLORS[sense] }}
                >
                  {senseLabels[sense].zh}
                </div>
                <div className="mt-0.5 text-[9px] tabular-nums text-white/38">
                  {pct(evalResult.bySense[sense].recallAt3)}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 max-h-24 space-y-1 overflow-y-auto pr-1">
            {hardCases.map((item) => (
              <div
                key={item.id}
                className="grid grid-cols-[22px_minmax(0,1fr)_42px] items-center gap-2 text-[10px] text-white/46"
              >
                <span
                  className="font-zen text-sm"
                  style={{ color: SENSE_COLORS[item.sense] }}
                >
                  {senseLabels[item.sense].zh}
                </span>
                <span className="truncate" title={`${item.text} → ${item.expected}`}>
                  {trimText(item.text, 28)}
                </span>
                <span className="text-right tabular-nums text-white/38">
                  rank {item.rank}
                </span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="mt-3 flex h-36 items-center justify-center rounded-lg border border-white/8 bg-white/[0.035] text-[11px] tracking-[0.18em] text-white/26">
          点击运行 30 条语义样本评测
        </div>
      )}
    </div>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/8 bg-white/[0.035] px-2 py-2 text-center">
      <div className="text-[9px] uppercase tracking-[0.16em] text-white/32">
        {label}
      </div>
      <div className="mt-1 text-sm tabular-nums text-white/78">{value}</div>
    </div>
  );
}

function BlendPanel({
  result,
  loading,
}: {
  result: ApiResult | null;
  loading: boolean;
}) {
  if (!result) {
    return (
      <div className="mt-3 flex h-48 items-center justify-center rounded-lg border border-white/8 bg-white/[0.035] text-[11px] tracking-[0.18em] text-white/26">
        {loading ? "正在生成候选权重" : "等待一次起念"}
      </div>
    );
  }

  return (
    <div className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">
      {SENSE_ORDER.map((sense) => (
        <BlendRow key={sense} sense={sense} hit={result.hits[sense]} />
      ))}
    </div>
  );
}

function BlendRow({ sense, hit }: { sense: Sense; hit: ApiResult["hits"][Sense] }) {
  const metric = blendMetric(sense, hit);
  const weights = hit.candidates
    .slice(0, 3)
    .map((candidate) => pct(candidate.weight))
    .join(" / ");

  return (
    <div className="rounded-lg border border-white/8 bg-white/[0.032] px-3 py-2">
      <div className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2">
        <span
          className="font-zen text-lg leading-none"
          style={{ color: SENSE_COLORS[sense] }}
        >
          {senseLabels[sense].zh}
        </span>
        <div className="min-w-0">
          <div className="truncate text-xs text-white/74">
            top-1 {trimText(hit.text, 18)}
          </div>
          <div className="mt-0.5 truncate text-[10px] text-white/34">
            top-k weights {weights}
          </div>
        </div>
        <div className="text-right text-[10px] tabular-nums text-white/46">
          {metric}
        </div>
      </div>
      <div className="mt-2 h-[3px] overflow-hidden rounded-full bg-white/8">
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.max(4, Math.min(100, hit.weight * 100))}%`,
            background: SENSE_COLORS[sense],
          }}
        />
      </div>
    </div>
  );
}

function blendMetric(sense: Sense, hit: ApiResult["hits"][Sense]) {
  const anchor = hit.anchor as any;
  const blend = hit.blend as any;
  if (sense === "eye") {
    return `H ${anchor.hue.toFixed(0)}→${blend.hue.toFixed(0)}`;
  }
  if (sense === "ear") {
    return `${anchor.freq.toFixed(0)}→${blend.freq.toFixed(0)}Hz`;
  }
  if (sense === "nose") {
    return `D ${anchor.density.toFixed(2)}→${blend.density.toFixed(2)}`;
  }
  if (sense === "tongue") {
    return `T ${anchor.temperature.toFixed(2)}→${blend.temperature.toFixed(2)}`;
  }
  if (sense === "body") {
    return `G ${anchor.gravity.toFixed(2)}→${blend.gravity.toFixed(2)}`;
  }
  return `Q ${anchor.turbulence.toFixed(2)}→${blend.turbulence.toFixed(2)}`;
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
