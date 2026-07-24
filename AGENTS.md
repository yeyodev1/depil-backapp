# AGENTS.md

- Single backend service. Runtime entrypoint is `src/index.ts`.
- Startup order is `dotenv.config()` -> `dbConnect()` -> `createApp()` -> `server.listen()`.
- `npm run build` must succeed before `npm start`, because `start` reads `dist/index.js`.
- `npm run dev` uses `ts-node-dev --respawn --transpile-only src/index.ts`.
- All API routes are mounted under `/api` in `src/routes/index.ts`; `/` is only a health check.
- CORS is allowlisted in `src/app.ts`; add new frontend origins there before browser calls will work.
- Required env vars: `DB_URI` and `JWT_SECRET`. Optional: `PORT` and `SLACK_ERROR_WEBHOOK`.
- `authMiddleware` expects `Authorization: Bearer <token>` and writes the decoded payload to `req.user`.
- `CustomError` is the handled HTTP error type; the global handler returns `{ message }` and notifies Slack on 5xx when configured.
- `npm run format` only formats files under `src/**/*.{js,jsx,ts,tsx,json,css,scss,md}`.
- There are no tests or CI workflows in this checkout; `npm run build` is the main verification step.
- `package-lock.json` and `pnpm-lock.yaml` both exist; do not introduce a third lockfile format.
