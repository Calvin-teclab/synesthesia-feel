// 六根 anchors — each sense has a handful of vivid prototype concepts.
// When the user enters anything, we find the nearest anchor in each sense
// (by cosine similarity in the ARK embedding space) and use its render hints
// to drive color, sound, particles, etc.

export type Sense = "eye" | "ear" | "nose" | "tongue" | "body" | "mind";

export interface EyeAnchor {
  text: string;
  /** HSL: hue 0-360, saturation 0-100, lightness 0-100 */
  hue: number;
  sat: number;
  light: number;
  /** dominant geometry hint: 'orb' | 'shard' | 'wave' | 'ember' | 'mist' */
  form: "orb" | "shard" | "wave" | "ember" | "mist";
}

export interface EarAnchor {
  text: string;
  /** base frequency Hz */
  freq: number;
  /** secondary tone, multiplied by base for richness */
  harmonic: number;
  waveform: OscillatorType; // 'sine' | 'square' | 'sawtooth' | 'triangle'
  /** attack/release seconds */
  attack: number;
  release: number;
  /** lowpass filter Hz */
  filter: number;
}

export interface NoseAnchor {
  text: string;
  /** particle dispersion: rise / swirl / settle / radiate */
  motion: "rise" | "swirl" | "settle" | "radiate" | "drift";
  /** density 0-1 */
  density: number;
}

export interface TongueAnchor {
  text: string;
  /** -1 cold .. +1 hot */
  temperature: number;
  /** 0 smooth .. 1 sharp */
  edge: number;
}

export interface BodyAnchor {
  text: string;
  /** vibration frequency (visual shake) Hz */
  tremor: number;
  /** 0 weightless .. 1 heavy */
  gravity: number;
}

export interface MindAnchor {
  text: string;
  /** 0 still .. 1 chaotic */
  turbulence: number;
  /** -1 contracting .. 1 expanding */
  scale: number;
}

export const eyeAnchors: EyeAnchor[] = [
  { text: "炽烈奔涌的赤红火焰", hue: 8, sat: 95, light: 55, form: "ember" },
  { text: "深邃静谧的靛蓝海面", hue: 220, sat: 70, light: 38, form: "wave" },
  { text: "春叶初醒的翠绿光泽", hue: 130, sat: 65, light: 50, form: "orb" },
  { text: "月光泻地的清冷银白", hue: 210, sat: 12, light: 82, form: "mist" },
  { text: "黄昏将沉的橙金余晖", hue: 30, sat: 85, light: 60, form: "ember" },
  { text: "樱花飘落的浅粉柔光", hue: 340, sat: 60, light: 80, form: "mist" },
  { text: "玄黑夜空里折射的锐利棱光", hue: 270, sat: 30, light: 25, form: "shard" },
  { text: "雪山纯净的天青色", hue: 195, sat: 55, light: 70, form: "orb" },
];

export const earAnchors: EarAnchor[] = [
  { text: "低沉绵长的庙堂钟鸣", freq: 82, harmonic: 2, waveform: "sine", attack: 0.6, release: 5.5, filter: 600 },
  { text: "清脆错落的瓷质风铃", freq: 1320, harmonic: 1.5, waveform: "triangle", attack: 0.005, release: 1.2, filter: 6000 },
  { text: "雨水打在芭蕉叶上的密集敲击", freq: 240, harmonic: 3, waveform: "square", attack: 0.01, release: 0.18, filter: 2400 },
  { text: "竹箫吹出的悠长气音", freq: 392, harmonic: 2, waveform: "sine", attack: 0.4, release: 2.4, filter: 1800 },
  { text: "古琴一指划过七弦的余韵", freq: 196, harmonic: 1.5, waveform: "triangle", attack: 0.02, release: 3.0, filter: 1200 },
  { text: "嘶吼着切开空气的电流轰鸣", freq: 110, harmonic: 1.01, waveform: "sawtooth", attack: 0.01, release: 0.6, filter: 900 },
  { text: "婴孩咯咯轻笑般的雀跃笛音", freq: 880, harmonic: 1.5, waveform: "triangle", attack: 0.03, release: 0.7, filter: 4500 },
];

export const noseAnchors: NoseAnchor[] = [
  { text: "盛夏夜里飘来的茉莉花香", motion: "drift", density: 0.45 },
  { text: "刚刚下过雨的湿润泥土气息", motion: "settle", density: 0.7 },
  { text: "寺院里点燃的檀木熏香", motion: "rise", density: 0.55 },
  { text: "刚出炉的烤面包暖香", motion: "radiate", density: 0.6 },
  { text: "海浪卷起的咸湿海风", motion: "swirl", density: 0.5 },
  { text: "深山松林里清冽的针叶气味", motion: "drift", density: 0.4 },
  { text: "老旧书页里沉睡的纸张气息", motion: "settle", density: 0.35 },
];

export const tongueAnchors: TongueAnchor[] = [
  { text: "蜜糖在舌尖化开的甘甜", temperature: 0.2, edge: 0.05 },
  { text: "新茶入喉之后回甘的微苦", temperature: -0.1, edge: 0.15 },
  { text: "柠檬咬下一口的尖锐酸爽", temperature: -0.4, edge: 0.85 },
  { text: "海盐在牡蛎上的咸鲜", temperature: 0.0, edge: 0.45 },
  { text: "花椒和辣椒同时炸开的麻辣", temperature: 0.9, edge: 0.95 },
  { text: "陈年老酒沉甸甸的醇厚", temperature: 0.5, edge: 0.25 },
  { text: "山泉一口入腹的清冽", temperature: -0.7, edge: 0.2 },
];

export const bodyAnchors: BodyAnchor[] = [
  { text: "冬日里被人紧紧拥抱的温暖", tremor: 0.6, gravity: 0.5 },
  { text: "冰凉溪水从指缝穿过的颤栗", tremor: 6.0, gravity: 0.2 },
  { text: "粗糙树皮在掌心擦过的钝痛", tremor: 1.5, gravity: 0.7 },
  { text: "鹅毛轻拂面颊般的柔软触觉", tremor: 0.4, gravity: 0.08 },
  { text: "细针突然刺入皮肤的锐利", tremor: 12.0, gravity: 0.3 },
  { text: "巨石压在胸口般沉重的窒息", tremor: 0.3, gravity: 0.98 },
  { text: "突然失重在空中悬浮的飘忽", tremor: 0.8, gravity: 0.02 },
];

export const mindAnchors: MindAnchor[] = [
  { text: "禅堂中万念俱寂的澄澈宁静", turbulence: 0.05, scale: -0.1 },
  { text: "浪潮般层层翻涌的澎湃激情", turbulence: 0.9, scale: 0.85 },
  { text: "夜深独坐时无处可诉的孤独", turbulence: 0.15, scale: -0.6 },
  { text: "孩童得到糖果那一刻的纯粹欢喜", turbulence: 0.55, scale: 0.5 },
  { text: "面对未知去向时迷雾般的困惑", turbulence: 0.4, scale: 0.0 },
  { text: "庙宇前合十低首的肃穆庄严", turbulence: 0.08, scale: 0.1 },
  { text: "笑看风云任他来去的洒脱自在", turbulence: 0.3, scale: 0.4 },
];

export const senseLabels: Record<Sense, { zh: string; sk: string; gloss: string }> = {
  eye: { zh: "眼", sk: "Cakṣus", gloss: "见色" },
  ear: { zh: "耳", sk: "Śrotra", gloss: "闻声" },
  nose: { zh: "鼻", sk: "Ghrāṇa", gloss: "嗅香" },
  tongue: { zh: "舌", sk: "Jihvā", gloss: "尝味" },
  body: { zh: "身", sk: "Kāya", gloss: "感触" },
  mind: { zh: "意", sk: "Manas", gloss: "知法" },
};

export const allAnchors = {
  eye: eyeAnchors,
  ear: earAnchors,
  nose: noseAnchors,
  tongue: tongueAnchors,
  body: bodyAnchors,
  mind: mindAnchors,
};

/** Flat list of {sense, index, text} — order matters for embedding alignment. */
export function flatAnchorList() {
  const out: { sense: Sense; index: number; text: string }[] = [];
  (Object.keys(allAnchors) as Sense[]).forEach((sense) => {
    allAnchors[sense].forEach((a, i) => {
      out.push({ sense, index: i, text: a.text });
    });
  });
  return out;
}
