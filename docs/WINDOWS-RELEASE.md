# Windows 本地验证与正式发布

所有命令从仓库根目录运行。现有正式前端为 https://jev-game-theory-arena.pages.dev/ ，后端配置为 `worker/wrangler.toml`。本地配置为 `worker/verification/wrangler.toml`，不能用于正式发布。

## 1. 更新并验证

先在运行本地 Worker 的窗口按 Ctrl+C，再执行：

```powershell
cd "C:\ANU\Game Theory\Jev-Game-Theory-Arena"
git switch feat/fair-generalization-experiments
git pull --ff-only origin feat/fair-generalization-experiments
npm.cmd ci
npm.cmd test
npm.cmd run verify:db
npm.cmd run verify:worker
```

保持窗口打开，另开 PowerShell，在同一目录运行：

```powershell
npm.cmd run verify:api -- --game=blotto
npm.cmd run verify:ui
```

应显示 `4/4 passed`。打开 http://localhost:8000，检查常规16、泛化32个按钮，两边10名士兵；选择后地图预览更新，出兵后再揭示模型选择。分别完成一局，确认实际走Jev、没有练习模式提示，且数据页正常。API检查只验证初始局面，不能代替完整对局。必要时运行 `npm.cmd run verify:api` 复测全部24组。

这一步消耗真实Workers AI额度，但D1和Durable Objects均为本地状态。不要把本地测试数据上传到正式数据库。若之前已完成旧布洛托测试局，可退出两个本地服务、将 `.verification/state` 重命名另存，然后重新执行 `verify:db` 初始化干净的本地数据库。

## 2. 正式数据库与 Worker

以下命令会实际修改线上服务。仅在本地验证通过后逐条运行，任何一步失败都停止。先备份，再应用新增迁移，最后部署Worker：

```powershell
npm.cmd run release:backup
npm.cmd run release:migrate
npm.cmd run release:worker
```

备份文件为 `.verification/before-release.sql`，包含正式数据，不要提交Git或上传网站。首次执行之前应已跑过 `verify:api`，它会创建 `.verification` 目录；再次备份前将旧备份另存。迁移应补上 `0005_experiments.sql`，保留历史表和数据。不要手动重复执行已应用的SQL。

Worker成功输出的名称应为 `jev-game-theory-proxy`。不要部署名为 `jev-game-theory-verification` 的本地配置。部署后在更新前端前，旧前端会收到更新提示/退回练习，因此应接着完成下一步。

## 3. 正式前端 Pages

后端成功后，合并 PR #1（若仍为Draft，先点击Ready for review）。这样主分支与即将上线的版本一致，避免以后的自动部署覆盖新版本。

在Cloudflare控制台 Workers & Pages → `jev-game-theory-arena` → 设置中确认生产分支。若已经连接GitHub并自动发布主分支，等待本次合并的部署显示成功即可。若需要手动上传：

```powershell
git switch main
git pull --ff-only origin main
npm.cmd run build
npx.cmd wrangler pages deploy dist --project-name jev-game-theory-arena --branch main
```

最后一条假设Pages生产分支为 `main`；若不同，必须把 `--branch main` 改成控制台显示的生产分支，否则可能只是预览部署。仅上传 `dist`，不要上传仓库根目录。构建脚本只复制公开前端资源，不包含Worker、数据库备份、配置或测试文件。

## 4. 上线验收

打开正式网址并强制刷新（Ctrl+Shift+R），确认新版本说明、16/32菜单及切换弹窗。另开窗口运行：

```powershell
npx.cmd wrangler tail --config worker/wrangler.toml
```

分别完成常规和泛化布洛托，确认没有7003错误、模型正常出招；允许共享数据后完成一局，检查实验v2数据页是否增加。线上检查会产生正式数据，不要把自动合成测试指向正式网址。

若发布异常，在Cloudflare控制台恢复对应Worker/Pages的上一版本。只回滚代码，不删除新增数据表；排查后再发布。此次实验涉及前后端协议升级，恢复时应成对恢复兼容版本。

官方命令参考：
- https://developers.cloudflare.com/workers/wrangler/commands/d1/
- https://developers.cloudflare.com/workers/wrangler/commands/pages/
