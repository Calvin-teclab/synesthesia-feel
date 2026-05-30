import { EmbedInput, embedInputs } from "./ark";
import { allAnchors, Sense } from "./anchors";
import { cosine, getAnchorEmbeddings } from "./mapping";

export interface EvaluationCase {
  id: string;
  text: string;
  sense: Sense;
  expectedIndex: number;
}

export interface EvaluationResult {
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

const EVAL_CASES: EvaluationCase[] = [
  { id: "eye-fire", text: "炉火忽然旺起来，整间屋子都被红光映亮", sense: "eye", expectedIndex: 0 },
  { id: "eye-sea", text: "夜色里几乎看不见边界的深蓝海面", sense: "eye", expectedIndex: 1 },
  { id: "eye-leaf", text: "春雨后刚舒展开的新叶泛着嫩绿", sense: "eye", expectedIndex: 2 },
  { id: "eye-moon", text: "窗外月光落在地板上，像一层薄薄的银霜", sense: "eye", expectedIndex: 3 },
  { id: "eye-sakura", text: "粉白花瓣被风卷起，轻轻落在肩头", sense: "eye", expectedIndex: 5 },

  { id: "ear-bell", text: "远处寺庙传来一声很长很低的钟响", sense: "ear", expectedIndex: 0 },
  { id: "ear-chime", text: "窗边风铃被风吹得叮叮当当", sense: "ear", expectedIndex: 1 },
  { id: "ear-rain", text: "急雨连续敲在大片叶子上，声音密密麻麻", sense: "ear", expectedIndex: 2 },
  { id: "ear-flute", text: "一支箫慢慢吹出悠远的尾音", sense: "ear", expectedIndex: 3 },
  { id: "ear-electric", text: "坏掉的电线发出刺耳又粗粝的嗡鸣", sense: "ear", expectedIndex: 5 },

  { id: "nose-jasmine", text: "夜里路过院墙，闻到一阵清甜的白花香", sense: "nose", expectedIndex: 0 },
  { id: "nose-soil", text: "暴雨刚停，泥土和草根的湿气涌上来", sense: "nose", expectedIndex: 1 },
  { id: "nose-incense", text: "香炉里一缕木质烟气慢慢升起", sense: "nose", expectedIndex: 2 },
  { id: "nose-bread", text: "面包从烤箱里拿出来，空气里都是暖香", sense: "nose", expectedIndex: 3 },
  { id: "nose-sea", text: "海风带着潮湿和一点咸味扑到脸上", sense: "nose", expectedIndex: 4 },

  { id: "tongue-honey", text: "蜂蜜在嘴里化开，甜味很柔和", sense: "tongue", expectedIndex: 0 },
  { id: "tongue-tea", text: "新泡的绿茶先苦后甜，喉咙里有回甘", sense: "tongue", expectedIndex: 1 },
  { id: "tongue-lemon", text: "柠檬汁碰到舌尖，酸得人立刻眯眼", sense: "tongue", expectedIndex: 2 },
  { id: "tongue-spicy", text: "麻辣火锅的第一口让舌头又烫又麻", sense: "tongue", expectedIndex: 4 },
  { id: "tongue-spring", text: "山泉水入口很凉，味道干净清冽", sense: "tongue", expectedIndex: 6 },

  { id: "body-hug", text: "冬天回家时被人抱住，身体一下暖起来", sense: "body", expectedIndex: 0 },
  { id: "body-stream", text: "冰凉溪水从手指之间流过去，皮肤发颤", sense: "body", expectedIndex: 1 },
  { id: "body-bark", text: "掌心擦过粗糙树皮，有一点钝钝的疼", sense: "body", expectedIndex: 2 },
  { id: "body-needle", text: "细针突然扎进皮肤，触感尖锐又短促", sense: "body", expectedIndex: 4 },
  { id: "body-heavy", text: "胸口像被重物压住，呼吸变得很费力", sense: "body", expectedIndex: 5 },

  { id: "mind-still", text: "坐了很久之后，脑子里终于安静下来", sense: "mind", expectedIndex: 0 },
  { id: "mind-passion", text: "好消息传来，情绪像浪一样往上涌", sense: "mind", expectedIndex: 1 },
  { id: "mind-lonely", text: "深夜一个人醒着，忽然觉得无处可说", sense: "mind", expectedIndex: 2 },
  { id: "mind-child", text: "孩子拿到糖果后忍不住笑出声", sense: "mind", expectedIndex: 3 },
  { id: "mind-unknown", text: "站在岔路口，不知道接下来该往哪里走", sense: "mind", expectedIndex: 4 },
];

let evalCache: Promise<EvaluationResult> | null = null;

function softmax(xs: number[], temperature = 0.05): number[] {
  const scaled = xs.map((x) => x / temperature);
  const max = Math.max(...scaled);
  const exps = scaled.map((x) => Math.exp(x - max));
  const sum = exps.reduce((total, value) => total + value, 0);
  return exps.map((value) => value / Math.max(1e-9, sum));
}

function normalizedEntropy(weights: number[]): number {
  const entropy = weights.reduce((total, weight) => {
    if (weight <= 1e-12) return total;
    return total - weight * Math.log(weight);
  }, 0);
  return entropy / Math.log(Math.max(2, weights.length));
}

function distributionEntropy(keys: string[], possibleCount: number): number {
  const counts = new Map<string, number>();
  keys.forEach((key) => counts.set(key, (counts.get(key) ?? 0) + 1));
  const weights = [...counts.values()].map((count) => count / Math.max(1, keys.length));
  const entropy = weights.reduce((total, weight) => total - weight * Math.log(weight), 0);
  return entropy / Math.log(Math.max(2, possibleCount));
}

function emptySenseMetrics() {
  return {
    count: 0,
    recallAt1: 0,
    recallAt3: 0,
    avgRank: 0,
  };
}

async function computeEvaluation(): Promise<EvaluationResult> {
  const anchors = await getAnchorEmbeddings();
  const vectors = await embedInputs(
    EVAL_CASES.map((item): EmbedInput => ({ type: "text", text: item.text })),
  );

  const evaluated = EVAL_CASES.map((item, index) => {
    const senseAnchors = anchors.filter((anchor) => anchor.sense === item.sense);
    const ranked = senseAnchors
      .map((anchor) => ({
        index: anchor.index,
        text: anchor.text,
        similarity: cosine(vectors[index], anchor.vec),
      }))
      .sort((a, b) => b.similarity - a.similarity);
    const rank = ranked.findIndex((anchor) => anchor.index === item.expectedIndex) + 1;
    const scores = ranked.map((anchor) => anchor.similarity);
    const margin = (ranked[0]?.similarity ?? 0) - (ranked[1]?.similarity ?? 0);
    const entropy = normalizedEntropy(softmax(scores));

    return {
      id: item.id,
      text: item.text,
      sense: item.sense,
      expected: allAnchors[item.sense][item.expectedIndex].text,
      rank: rank || ranked.length + 1,
      margin,
      entropy,
      top3: ranked.slice(0, 3).map(({ text, similarity }) => ({ text, similarity })),
      top1Key: `${item.sense}-${ranked[0]?.index ?? "none"}`,
    };
  });

  const bySense = Object.keys(allAnchors).reduce(
    (acc, sense) => {
      acc[sense as Sense] = emptySenseMetrics();
      return acc;
    },
    {} as EvaluationResult["bySense"],
  );

  evaluated.forEach((item) => {
    const metrics = bySense[item.sense];
    metrics.count += 1;
    metrics.recallAt1 += item.rank === 1 ? 1 : 0;
    metrics.recallAt3 += item.rank <= 3 ? 1 : 0;
    metrics.avgRank += item.rank;
  });

  Object.values(bySense).forEach((metrics) => {
    if (metrics.count === 0) return;
    metrics.recallAt1 /= metrics.count;
    metrics.recallAt3 /= metrics.count;
    metrics.avgRank /= metrics.count;
  });

  const sampleCount = evaluated.length;
  return {
    generatedAt: new Date().toISOString(),
    sampleCount,
    metrics: {
      recallAt1:
        evaluated.filter((item) => item.rank === 1).length / Math.max(1, sampleCount),
      recallAt3:
        evaluated.filter((item) => item.rank <= 3).length / Math.max(1, sampleCount),
      mrr:
        evaluated.reduce((total, item) => total + 1 / Math.max(1, item.rank), 0) /
        Math.max(1, sampleCount),
      avgTop1Margin:
        evaluated.reduce((total, item) => total + item.margin, 0) /
        Math.max(1, sampleCount),
      avgSoftmaxEntropy:
        evaluated.reduce((total, item) => total + item.entropy, 0) /
        Math.max(1, sampleCount),
      anchorDistributionEntropy: distributionEntropy(
        evaluated.map((item) => item.top1Key),
        anchors.length,
      ),
    },
    bySense,
    cases: evaluated.map(({ top1Key, ...item }) => item),
  };
}

export function runEmbeddingEvaluation() {
  evalCache ??= computeEvaluation().catch((error) => {
    evalCache = null;
    throw error;
  });
  return evalCache;
}
