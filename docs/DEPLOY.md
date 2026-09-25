# Deploying your own copy · 部署指南

[English](#english) · [中文](#中文)

## English

The site has two parts:

| Part | Where it runs | Holds secrets? |
|---|---|---|
| Static website (`index.html`, `css/`, `js/`, `shared/`) | GitHub Pages, or any static host | No |
| API proxy (`worker/`) | Cloudflare Workers (the free tier is enough) | Only if you use TypeSafe's own API (then its key is a Worker secret). With Workers AI there is no key at all |

The browser never sees the API key. Without the proxy, the site still works and a built-in practice bot plays instead of Jev.

### 1. Website

Any static host works. This project uses **Cloudflare Pages**: Workers & Pages → Create → Pages → Connect to Git, framework preset *None*, no build command, output directory `/`. Every push to `main` redeploys. (GitHub Pages also works: Settings → Pages → Deploy from a branch → `main` / root.)

### 2. Proxy

Requires Node.js 18 or later.

```bash
cd worker
npx wrangler login                          # or: export CLOUDFLARE_API_TOKEN=... ("Edit Cloudflare Workers" template)
npx wrangler deploy                         # Jev is reached through Workers AI (typesafe/jev), billed to your Cloudflare account
# optional: npx wrangler secret put TYPESAFE_API_KEY   to use TypeSafe's own API instead
```

Then:

1. In `worker/wrangler.toml`, set `ALLOWED_ORIGINS` to your site's origin (for example `https://you.github.io`, with no path and no trailing slash), then redeploy.
2. In `js/config.js`, set `proxyUrl` to `https://<worker-name>.<subdomain>.workers.dev/decide`.
3. If you use a custom domain instead of `*.workers.dev`, add it to `connect-src` in the Content-Security-Policy in `index.html`.

### What the proxy protects against

- **Only fixed questions.** The proxy accepts only `{ game, mode, payload }`. Each payload is validated against a strict per-game schema (enums, bounded numbers and lists, no free text), and the Jev prompt is built on the server from `shared/prompts.js`. Nobody can use your key to ask Jev their own questions.
- **Origin allowlist.** Browsers on other websites can't call it. Scripts can fake the `Origin` header, which is why the limits below exist.
- **Burst limits per visitor.** 15 moves per 10 seconds and 60 per minute (`[[ratelimits]]` in `wrangler.toml`).
- **Daily quotas.** Each visitor gets `IP_DAILY_LIMIT` Jev moves per UTC day (default 600) and the whole site gets `DAILY_LIMIT` (default 20,000). Counts are exact: they're kept in a Durable Object (`Guard`, SQLite storage, available on the free plan). Visitors are identified by a salted hash of their IP, never the raw address.
- **Misuse block.** Normal play never sends invalid requests, so a visitor who sends `MAX_INVALID` (default 20) in a day is blocked for `BLOCK_HOURS` (default 24).
- **Optional human check.** Set `turnstileSiteKey` in `js/config.js`, plus the Worker secrets `TURNSTILE_SECRET` and `SESSION_SECRET` (any long random string). After one Cloudflare Turnstile check the player gets a signed 30-minute session.
- **Minimal responses.** The proxy returns only `model` and `answers`.

Every refusal returns `{ error, retryAfter }`. The site shows a matching notice with a countdown ("too fast", "today's moves used up", "paused", "Jev busy"), lets the practice bot play until it ends, and offers a one-click switch to Practice mode. Players can't use their own API keys.

**Recommended:** if the TypeSafe console offers usage limits or alerts, set them too. If a key ever leaks, revoke it there and run `npx wrangler secret put TYPESAFE_API_KEY` again. No website change is needed.

### Anonymous gameplay data (optional)

The Insights page shows aggregate statistics stored in Cloudflare D1 (the free tier is enough). Without a database, the Worker simply stores nothing and the page shows sample data.

```bash
npx wrangler d1 create jev-lab-data                      # prints a database_id
# uncomment the [[d1_databases]] block in wrangler.toml and paste the id
npx wrangler d1 migrations apply jev-lab-data --remote   # creates the tables
npx wrangler deploy
```

What is stored (see `shared/telemetry.js`): game, version, opponent mode, who moved (human, Jev or bot), the move, and a coarse detail such as a hand-strength bucket. Each match gets a random id, and only the UTC date is kept. No IP, account, device data or free text is stored. Players can opt out, and a separate opt-in flag marks data that may be used for research.

### Releasing an update

1. Bump `VERSION` in `js/version.js`, and `version` plus `notes` (en/zh) in `version.json`, to the same new number.
2. Commit and push.

Visitors who have the site open will see "A new version is available" with a one-click refresh (it re-downloads every file, just like Ctrl+Shift+R). Returning visitors will see the release notes once.

### Cost estimate

At $0.042 per million input tokens and roughly 400–900 tokens per move, 20,000 moves a day costs well under $1.

---

## 中文

网站分两部分：

| 部分 | 运行在哪里 | 是否包含机密 |
|---|---|---|
| 静态网站（`index.html`、`css/`、`js/`、`shared/`） | GitHub Pages 或任意静态托管 | 否 |
| API 代理（`worker/`） | Cloudflare Workers（免费额度即可） | 只有改用 TypeSafe 自己的 API 时才有（Key 作为 Worker secret 保存）；用 Workers AI 时完全没有 Key |

浏览器永远拿不到 Key。不部署代理时网站也能用，由内置的练习机器人代替 Jev。

### 1. 网站

任何静态托管都可以。本项目使用 **Cloudflare Pages**：Workers & Pages → Create → Pages → Connect to Git，Framework preset 选 *None*，不填构建命令，输出目录填 `/`，之后每次推送到 `main` 都会自动部署。（也可以用 GitHub Pages：Settings → Pages → Deploy from a branch → `main` / root。）

### 2. 代理

需要 Node.js 18 或更高版本。

```bash
cd worker
npx wrangler login                          # 或者：export CLOUDFLARE_API_TOKEN=...（选 "Edit Cloudflare Workers" 模板）
npx wrangler deploy                         # 通过 Cloudflare Workers AI（typesafe/jev）调用 Jev，费用记在你的 Cloudflare 账号上
# 可选：npx wrangler secret put TYPESAFE_API_KEY   改用 TypeSafe 自己的 API
```

然后：

1. 把 `worker/wrangler.toml` 的 `ALLOWED_ORIGINS` 改成你的网站域名（例如 `https://you.github.io`，不带路径，也不带结尾的 `/`），再重新部署一次。
2. 把 `js/config.js` 的 `proxyUrl` 改成 `https://<worker 名>.<子域名>.workers.dev/decide`。
3. 如果用自定义域名而不是 `*.workers.dev`，还要把它加到 `index.html` 里 CSP 的 `connect-src`。

### 代理能防住什么

- **只接受固定的问题。** 只接受 `{ game, mode, payload }`，按各游戏的严格 schema 校验（枚举、有界的数字和列表、不允许自由文本），提示词在服务端根据 `shared/prompts.js` 拼好。别人无法用你的 Key 问 Jev 任意问题。
- **来源白名单。** 其他网站的浏览器调用不了。脚本可以伪造 `Origin` 请求头，所以还有下面几层限制。
- **短时限流。** 每位访客每 10 秒最多 15 步、每分钟最多 60 步（见 `wrangler.toml` 的 `[[ratelimits]]`）。
- **每日额度。** 每位访客每个 UTC 日最多 `IP_DAILY_LIMIT` 步（默认 600），全站最多 `DAILY_LIMIT` 步（默认 20000）。计数是精确的，存放在一个 Durable Object（`Guard`，使用 SQLite 存储，免费版可用）里。访客用加盐后的 IP 哈希识别，不保存原始 IP。
- **滥用封禁。** 正常游戏永远不会发出非法请求，所以一天内发出 `MAX_INVALID` 次（默认 20 次）非法请求的访客，会被封禁 `BLOCK_HOURS` 小时（默认 24 小时）。
- **可选人机验证。** 在 `js/config.js` 里填 `turnstileSiteKey`，并设置 Worker secret `TURNSTILE_SECRET` 和 `SESSION_SECRET`（任意一串足够长的随机字符）。玩家通过一次 Cloudflare Turnstile 验证后，会拿到一个 30 分钟有效的签名会话。
- **只返回必要数据。** 响应里只有 `model` 和 `answers`。

每次拒绝都会返回 `{ error, retryAfter }`。网站会显示对应的提示和倒计时（“出招太快”“今天的次数用完了”“暂停使用”“Jev 正忙”），在此期间由练习机器人出招，并提供一键切换到练习模式的按钮。玩家不能使用自己的 API Key。

**建议：** 如果 TypeSafe 控制台支持用量上限或提醒，也一并设置。Key 一旦泄露，就在控制台作废它，再运行一次 `npx wrangler secret put TYPESAFE_API_KEY`，网站不用做任何改动。

### 匿名对局数据（可选）

数据洞察页展示的是存放在 Cloudflare D1 里的汇总统计（免费额度即可）。没有数据库时，Worker 什么都不存，页面显示示例数据。

```bash
npx wrangler d1 create jev-lab-data                      # 会输出 database_id
# 取消 wrangler.toml 里 [[d1_databases]] 那几行的注释，填入 id
npx wrangler d1 migrations apply jev-lab-data --remote   # 建表
npx wrangler deploy
```

存储的内容（见 `shared/telemetry.js`）：游戏和版本、对手模式、出招方（人类、Jev 或机器人）、出了什么招，以及一个粗粒度的细节，比如手牌强弱档位。每局只有一个随机 ID，时间只保留 UTC 日期。不存 IP、账号、设备信息或任何自由文本。玩家可以选择不参与；另有一个需要主动勾选的标记，表示这部分数据可以用于研究。

### 发布更新

1. 把 `js/version.js` 里的 `VERSION`，和 `version.json` 里的 `version` 与 `notes`（中英文），改成同一个新版本号。
2. 提交并推送。

正开着网站的访客会看到“新版本已发布”的提示，一键即可刷新（会重新下载所有文件，效果等同 Ctrl+Shift+R）；老访客再次访问时会看到一次更新内容。

### 费用估算

按每百万输入 token 0.042 美元、每步约 400 到 900 token 计算，每天 2 万步的费用远低于 1 美元。
