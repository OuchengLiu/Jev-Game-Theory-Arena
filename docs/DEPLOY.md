# Deploying your own copy · 部署指南

[English](#english) · [中文](#中文)

## English

The site has two parts:

| Part | Where it runs | Holds secrets? |
|---|---|---|
| Static website (`index.html`, `css/`, `js/`, `shared/`) | GitHub Pages, or any static host | No |
| API proxy (`worker/`) | Cloudflare Workers (the free tier is enough) | Yes: your TypeSafe API key, stored as a Worker secret |

The browser never sees the API key. Without the proxy, the site still works and a built-in practice bot plays instead of Jev.

### 1. Website

Push the repository to GitHub, then go to **Settings → Pages → Deploy from a branch → `main` / root**.

### 2. Proxy

Requires Node.js 18 or later.

```bash
cd worker
npx wrangler login                          # or: export CLOUDFLARE_API_TOKEN=... ("Edit Cloudflare Workers" template)
npx wrangler kv namespace create USAGE      # paste the printed id into wrangler.toml and uncomment the [[kv_namespaces]] block
npx wrangler secret put TYPESAFE_API_KEY    # paste your key from https://console.typesafe.ai/keys
npx wrangler deploy
```

Then:

1. In `worker/wrangler.toml`, set `ALLOWED_ORIGINS` to your site's origin (for example `https://you.github.io`, with no path and no trailing slash), then redeploy.
2. In `js/config.js`, set `proxyUrl` to `https://<worker-name>.<subdomain>.workers.dev/decide`.
3. If you use a custom domain instead of `*.workers.dev`, add it to `connect-src` in the Content-Security-Policy in `index.html`.

### What the proxy protects against

- **Only fixed questions.** The proxy accepts only `{ game, mode, payload }`. Each payload is validated against a strict per-game schema (enums, bounded numbers and lists, no free text), and the Jev prompt is built on the server from `shared/prompts.js`. Nobody can use your key to ask Jev their own questions.
- **Origin allowlist.** Browsers on other websites can't call it. Scripts can fake the `Origin` header, which is why the limits below exist.
- **Per-IP rate limit.** 40 requests per minute by default (`[[ratelimits]]` in `wrangler.toml`).
- **Daily budget.** Once about `DAILY_LIMIT` calls have been made in a UTC day, the proxy stops calling Jev. The counter is sampled so it stays within KV's free write quota, which makes it approximate.
- **Optional human check.** Set `turnstileSiteKey` in `js/config.js`, plus the Worker secrets `TURNSTILE_SECRET` and `SESSION_SECRET` (any long random string). After one Cloudflare Turnstile check the player gets a signed 30-minute session.
- **Minimal responses.** The proxy returns only `model` and `answers`.

If the proxy refuses or fails, the site switches to the practice bot for that move and tells the player.

**Recommended:** if the TypeSafe console offers usage limits or alerts, set them too. If a key ever leaks, revoke it there and run `npx wrangler secret put TYPESAFE_API_KEY` again. No website change is needed.

### Cost estimate

At $0.042 per million input tokens and roughly 400–900 tokens per move, 20,000 moves a day costs well under $1.

---

## 中文

网站分两部分：

| 部分 | 运行在哪里 | 是否包含机密 |
|---|---|---|
| 静态网站（`index.html`、`css/`、`js/`、`shared/`） | GitHub Pages 或任意静态托管 | 否 |
| API 代理（`worker/`） | Cloudflare Workers（免费额度即可） | 是：TypeSafe API Key，作为 Worker secret 保存 |

浏览器永远拿不到 Key。不部署代理时网站也能用，由内置的练习机器人代替 Jev。

### 1. 网站

把仓库推到 GitHub，然后进入 **Settings → Pages → Deploy from a branch → `main` / root**。

### 2. 代理

需要 Node.js 18 或更高版本。

```bash
cd worker
npx wrangler login                          # 或者：export CLOUDFLARE_API_TOKEN=...（选 "Edit Cloudflare Workers" 模板）
npx wrangler kv namespace create USAGE      # 把输出的 id 填进 wrangler.toml，并取消 [[kv_namespaces]] 那几行的注释
npx wrangler secret put TYPESAFE_API_KEY    # 粘贴在 https://console.typesafe.ai/keys 申请的 Key
npx wrangler deploy
```

然后：

1. 把 `worker/wrangler.toml` 的 `ALLOWED_ORIGINS` 改成你的网站域名（例如 `https://you.github.io`，不带路径，也不带结尾的 `/`），再重新部署一次。
2. 把 `js/config.js` 的 `proxyUrl` 改成 `https://<worker 名>.<子域名>.workers.dev/decide`。
3. 如果用自定义域名而不是 `*.workers.dev`，还要把它加到 `index.html` 里 CSP 的 `connect-src`。

### 代理能防住什么

- **只接受固定的问题。** 只接受 `{ game, mode, payload }`，按各游戏的严格 schema 校验（枚举、有界的数字和列表、不允许自由文本），提示词在服务端根据 `shared/prompts.js` 拼好。别人无法用你的 Key 问 Jev 任意问题。
- **来源白名单。** 其他网站的浏览器调用不了。脚本可以伪造 `Origin` 请求头，所以还有下面几层限制。
- **按 IP 限流。** 默认每分钟 40 次（见 `wrangler.toml` 的 `[[ratelimits]]`）。
- **每日预算。** 一个 UTC 日内调用达到约 `DAILY_LIMIT` 次后，代理停止调用 Jev。为了不超过 KV 的免费写入额度，计数采用抽样方式，所以是近似值。
- **可选人机验证。** 在 `js/config.js` 里填 `turnstileSiteKey`，并设置 Worker secret `TURNSTILE_SECRET` 和 `SESSION_SECRET`（任意一串足够长的随机字符）。玩家通过一次 Cloudflare Turnstile 验证后，会拿到一个 30 分钟有效的签名会话。
- **只返回必要数据。** 响应里只有 `model` 和 `answers`。

如果代理拒绝请求或调用失败，这一步会切换到练习机器人出招，并告知玩家。

**建议：** 如果 TypeSafe 控制台支持用量上限或提醒，也一并设置。Key 一旦泄露，就在控制台作废它，再运行一次 `npx wrangler secret put TYPESAFE_API_KEY`，网站不用做任何改动。

### 费用估算

按每百万输入 token 0.042 美元、每步约 400 到 900 token 计算，每天 2 万步的费用远低于 1 美元。
