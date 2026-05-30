# 多模态感知-联觉通感 · Synesthesia Engine

把任意一个字、一句诗、一段情绪，投射到「眼耳鼻舌身意」。

核心思路：**Embedding 就是数学版的联觉。** 任何概念都会被映射到同一个高维语义空间——这正是大脑里"通感"的工程类比。我们为六根各预设若干"原型概念"（颜色/声音/气味/味道/触感/心绪），把用户输入的 embedding 与它们做 cosine similarity，再用最近邻的属性去驱动：

- **眼**：色相 → 中央粒子云的颜色与形态（orb / shard / wave / ember / mist）
- **耳**：基频、波形、滤波 → Web Audio 现场合成一段音色
- **鼻**：扩散运动 → 小型粒子的飘升/盘旋/沉淀
- **舌**：温度 / 锐度 → 滑块化的视觉指示
- **身**：颤动 / 重力 → 粒子云的抖动与下坠
- **意**：澜（湍流）/ 势（收放） → 整个云团的呼吸节律

中央 WebGL shader 还吃下 embedding 的前 4 维作为微观引导向量——所以输入不同的话语，云团就会朝不同方向"偏"，即使匹配到同一组锚点也不会撞脸。

## 运行

```bash
# 1. 安装依赖（已装）
npm install

# 2. 配置 ARK key
cp .env.example .env.local
# 编辑 .env.local 填入你的 ARK_API_KEY

# 3. 启动
npm run dev
# → http://localhost:3000
```

第一次提交输入会顺便把 ~45 条锚点也一起 embed（一次性 ~1 个 batch），之后只 embed 用户输入，毫秒级响应。

## 玩法建议

预设了 6 个示例可以一键体验，例如：

- `茉莉花茶` —— 看眼是樱花/月光哪个赢
- `雷雨夜里的孤独` —— 耳跟意会不会同时打中"低沉的钟鸣"和"夜深独坐"
- `刚收到好消息时心跳的瞬间` —— 身的颤动 + 意的澎湃应当被同时点亮

也可以输入古诗一句、人名、概念、甚至带表情符号的微博，感受 embedding 把它"分拣"到六感的过程。

## 项目结构

```
app/
  page.tsx                  主体验页（输入 + 中央 3D + 六根面板）
  api/synesthesia/route.ts  POST: 文本 → 六根映射
components/
  ParticleField.tsx         Three.js 粒子云 + 自定义 GLSL
  SenseCard.tsx             单一感官的玻璃质感卡片
lib/
  anchors.ts                六根的"原型概念"与渲染参数
  ark.ts                    火山方舟 doubao-embedding API
  mapping.ts                cosine + softmax + signature 压缩
  audio.ts                  Web Audio 实时合成器
```

## 设计取舍

- **为什么不直接让 LLM 描述**：联觉的精髓是"不假思索的瞬间映射"，embedding 余弦相似度恰好对应这种"一念即到"。
- **为什么用 anchor 而不是 free generation**：anchor 同时提供文本与可渲染参数（HSL、Hz、波形…），把语义空间钉到可视/可听的坐标系上；任意 LLM 生成无法直接渲染。
- **为什么是这套 anchor**：为每一感官挑了 7–8 条具备强烈感官特征的中文句子，兼顾古典（钟、香、琴）与日常（烤面包、雨后泥土）。可以在 `lib/anchors.ts` 自由增删。
