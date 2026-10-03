# Windows: live Jev verification without a production deployment

Run all commands from the repository root, not `worker`. Requires Node 22.13+ and a successful Wrangler login. This configuration uses real Workers AI (account quota/charges apply), but simulated local D1 and Durable Objects. Do not deploy this configuration or add `--remote` to these commands.

```powershell
npm.cmd run verify:db
npm.cmd run verify:worker
```

Keep the Worker terminal open. In a second PowerShell at the repository root:

```powershell
npm.cmd run verify:api
npm.cmd run verify:ui
```

The API check makes up to 24 real decisions: six games × two rulesets × two analysis modes. It validates every required answer and complete legal-action probability distribution, including 286 generalization Blotto options. Results are saved to `.verification/api-report.json`. Authentication, billing or rate-limit failures stop early. Other failures remain visible; there is no offline-bot fallback in this check.

Open http://localhost:8000 for manual full-game checks. The local server substitutes only the served frontend configuration and CSP; committed production configuration stays unchanged. Keep both terminals open. Confirm rule dialogs, play complete games in both variants, and check the data page. Watch for offline/practice indicators: a playable game alone does not prove Jev responded. All local UI telemetry goes to the local Worker.

Passing 24/24 proves initial-state API compatibility only. It does not establish model strategic quality, late-game behavior, statistical allocation ratios, or visual correctness. Existing unit tests cover rules, hidden-information exclusion and allocation behavior; DOM tests cover interaction flows. Run those separately with `npm.cmd ci`, `npm.cmd test`, and `npm.cmd run test:dom`.

The production deployment list proves account access, not that this branch is deployed. Production migrations/deployment require a separate release step after validation.

References: https://developers.cloudflare.com/workers/local-development/ and https://developers.cloudflare.com/workers/wrangler/configuration/
