# Jev Game Theory Lab · Jev 博弈实验室

**Play game-theory games against [Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev), a model that doesn't write text. It returns a probability for each option.**
与 TypeSafe 的 System One 模型 Jev 对弈：它不生成文字，只为每个选项给出概率。

[English](#english) · [中文](#中文)

---

## English

### Why Jev suits these games

In most games Jev only has a few legal moves to choose from. Jev's `choice` question takes a situation and a set of options and returns a **calibrated probability for each option**. In game theory, that distribution is a **mixed strategy**. So there's no need for an LLM to write out candidate moves first: the game engine lists the legal moves, and Jev returns a probability for each.

Jev is fast (tens to hundreds of ms), but it [does not do arithmetic reliably](https://docs.typesafe.ai/model-jaggedness/jev-1.13). So the work is split this way:

| Code does | Jev does |
|---|---|
| rules, legal moves, pot odds, Monte-Carlo equity, dice probabilities | a judgment call over the legal moves, based on semantic buckets (“strong hand”, “bid is unlikely”) |
| sampling the final move from Jev's distribution | side questions such as “is the opponent bluffing?” (`noul`) |

### Games

| Game | Concept | What Jev decides |
|---|---|---|
| ♠️ Heads-up Limit Hold'em | bluffing, imperfect information | fold / check / call / bet / raise + “opponent bluffing?” |
| 🎲 Liar's Dice | bluffing, Bayesian beliefs | which bid to make, or whether to call “Liar!” |
| 🤝 Iterated Prisoner's Dilemma | repeated games, reputation | cooperate / defect |
| ✊ Rock-Paper-Scissors | mixed-strategy Nash equilibrium | *predicts your next throw*; code plays the counter |
| ⚖️ Ultimatum Game | fairness vs. rationality | what to offer; whether to accept |

Every move shows Jev's full probability distribution in a side panel. You can switch between **Mixed** (sample from Jev's distribution) and **Greedy** (always play the top choice).

### Run locally

It's a static site with no build step:

```bash
python3 -m http.server 8000     # then open http://localhost:8000
```

Without any configuration, the games use the **built-in bots**. To play against real Jev, choose one of these:

- **Personal key (local testing):** Settings ⚙️ → paste your TypeSafe key. The key stays in `sessionStorage` for that tab only. This only works if TypeSafe allows requests from browsers (CORS).
- **Public deployment:** deploy the Worker proxy (below) and set `proxyUrl` in [`js/config.js`](js/config.js).

### Deploy

**1. Website → GitHub Pages.** Push this repo, then go to *Settings → Pages → Deploy from branch → `main` / root*.

**2. API proxy → Cloudflare Workers** (the free tier is enough):

```bash
cd worker
npx wrangler login
npx wrangler secret put TYPESAFE_API_KEY
# edit ALLOWED_ORIGINS in wrangler.toml to your Pages origin, e.g. https://you.github.io
npx wrangler deploy
```

Then put the Worker URL (`https://jev-game-theory-proxy.<you>.workers.dev/decide`) in `js/config.js` → `proxyUrl`. If you use a custom domain instead of `*.workers.dev`, add it to `connect-src` in the CSP in `index.html`.

### How the API key is protected

The key exists **only** as a Worker secret. The Worker:

1. **Accepts only fixed games.** It takes `{game, payload}`, validates the payload against a strict schema (enums, bounded ints and lists, no free text), and **builds the prompt on the server** from [`shared/prompts.js`](shared/prompts.js). Visitors can't send their own prompts, so the proxy can't be used as a free general-purpose Jev endpoint.
2. **Checks the origin.** It only responds to origins listed in `ALLOWED_ORIGINS`.
3. **Rate-limits per IP.** It uses the Cloudflare Rate Limiting binding (40 requests/min by default).
4. **Caps the daily total.** With the optional `USAGE` KV namespace, it stops at `DAILY_LIMIT` calls per day.
5. **Can require a human check.** Set `turnstileSiteKey` in `js/config.js` and the `TURNSTILE_SECRET` + `SESSION_SECRET` Worker secrets. After one Turnstile check the player gets a signed 30-minute session.
6. **Returns only what the game needs.** The response contains `model` and `answers`, nothing else.

If Jev is unreachable or rate-limited, the game switches to the built-in bot for that move and says so.

Also set a spending limit in the TypeSafe console. At $0.042 per million input tokens and roughly 400 tokens per move, 20,000 moves a day costs about $0.35.

### Project layout

```
index.html, css/, js/          static front-end (vanilla ES modules, no build)
js/engine.js                   Jev / built-in bot decision engine, sampling
js/games/*.js                  one module per game (rules, UI, built-in bot, bilingual strings)
shared/prompts.js, shared/games/*.js
                               schemas + Jev question templates, shared by the browser and the Worker
worker/                        Cloudflare Worker proxy
```

To add a game, create `shared/games/<id>.js` (`schema` + `build`) and `js/games/<id>.js` (`mount`), then register both. [`js/games/pd.js`](js/games/pd.js) is the smallest example.

---

## 中文

### 为什么 Jev 适合这些游戏

大多数游戏在每一步只有几个合法动作。Jev 的 `choice` 问题接收一个局面和一组选项，为**每个选项返回校准过的概率**。在博弈论里，这组概率就是一个**混合策略**。所以不需要先让 LLM 写出候选动作：游戏引擎列出合法动作，Jev 为每个动作给出概率。

Jev 很快（几十到几百毫秒），但[算数不可靠](https://docs.typesafe.ai/model-jaggedness/jev-1.13)。所以分工如下：

| 代码负责 | Jev 负责 |
|---|---|
| 规则、合法动作、底池赔率、蒙特卡洛胜率、骰子概率 | 根据语义化描述（“强牌”“这个叫点不太可能成立”）在合法动作中做判断 |
| 按 Jev 给出的概率抽取最终动作 | 附加问题，比如“对手在诈唬吗？”（`noul`） |

### 游戏

| 游戏 | 博弈概念 | Jev 负责的决策 |
|---|---|---|
| ♠️ 单挑限注德州扑克 | 诈唬、不完全信息 | 弃牌 / 过牌 / 跟注 / 下注 / 加注，外加“对手在诈唬吗？” |
| 🎲 吹牛骰子 | 诈唬、贝叶斯推断 | 叫哪个点，还是直接“开！” |
| 🤝 重复囚徒困境 | 重复博弈、声誉 | 合作 / 背叛 |
| ✊ 石头剪刀布 | 混合策略纳什均衡 | *预测你下一手出什么*，代码出克制它的那一手 |
| ⚖️ 最后通牒博弈 | 公平与理性 | 分给你多少；接受还是拒绝 |

每一步都会在侧栏显示 Jev 的完整概率分布。可以在“混合”（按概率抽样）和“贪心”（总是选概率最高的动作）之间切换。

### 本地运行

纯静态网站，不需要构建：

```bash
python3 -m http.server 8000     # 然后打开 http://localhost:8000
```

不做任何配置时，游戏使用**内置机器人**。想和真正的 Jev 对战，二选一：

- **个人 Key（本地测试）：** 设置 ⚙️ → 粘贴 TypeSafe Key。Key 只存在当前标签页的 `sessionStorage` 里。只有在 TypeSafe 允许浏览器直接调用（CORS）时才能用。
- **公开部署：** 部署下面的 Worker 代理，并在 [`js/config.js`](js/config.js) 里填写 `proxyUrl`。

### 部署

**1. 网站 → GitHub Pages。** 推送仓库后，进入 *Settings → Pages → Deploy from branch → `main` / root*。

**2. API 代理 → Cloudflare Workers**（免费额度就够）：

```bash
cd worker
npx wrangler login
npx wrangler secret put TYPESAFE_API_KEY
# 把 wrangler.toml 里的 ALLOWED_ORIGINS 改成你的 Pages 域名，例如 https://you.github.io
npx wrangler deploy
```

然后把 Worker 地址（`https://jev-game-theory-proxy.<you>.workers.dev/decide`）填到 `js/config.js` 的 `proxyUrl`。如果用自定义域名而不是 `*.workers.dev`，还要把它加到 `index.html` 里 CSP 的 `connect-src`。

### 怎样保护 API Key

Key **只**以 Worker secret 的形式存在。Worker 会：

1. **只接受固定的游戏。** 它接收 `{game, payload}`，按严格的 schema 校验（枚举、有界整数和列表、不允许自由文本），然后根据 [`shared/prompts.js`](shared/prompts.js) **在服务端拼出提示词**。访客没法发自己的提示词，所以别人无法把这个代理当成免费的通用 Jev 接口。
2. **检查来源。** 只响应 `ALLOWED_ORIGINS` 里列出的域名。
3. **按 IP 限流。** 使用 Cloudflare Rate Limiting（默认每分钟 40 次）。
4. **限制每日总量。** 配置可选的 `USAGE` KV 后，每天达到 `DAILY_LIMIT` 次就停止调用。
5. **可要求人机验证。** 在 `js/config.js` 里填 `turnstileSiteKey`，并设置 Worker secret `TURNSTILE_SECRET` 和 `SESSION_SECRET`。玩家通过一次 Turnstile 验证后，会拿到一个 30 分钟有效的签名会话。
6. **只返回游戏需要的数据。** 响应里只有 `model` 和 `answers`。

如果连不上 Jev 或被限流，这一步会切换到内置机器人出招，界面上会注明。

另外建议在 TypeSafe 控制台设置消费上限。按每百万输入 token 0.042 美元、每步约 400 token 计算，每天 2 万步大约 0.35 美元。

### 目录结构

```
index.html, css/, js/          静态前端（原生 ES modules，无需构建）
js/engine.js                   决策引擎（Jev / 内置机器人）与抽样
js/games/*.js                  每个游戏一个模块（规则、界面、内置机器人、双语文案）
shared/prompts.js, shared/games/*.js
                               schema 与 Jev 问题模板，浏览器和 Worker 共用
worker/                        Cloudflare Worker 代理
```

新增游戏：创建 `shared/games/<id>.js`（`schema` + `build`）和 `js/games/<id>.js`（`mount`），然后分别注册。最小的例子是 [`js/games/pd.js`](js/games/pd.js)。

---

MIT License · Unofficial community project, not affiliated with TypeSafe AI · 非官方社区项目，与 TypeSafe AI 无关联
