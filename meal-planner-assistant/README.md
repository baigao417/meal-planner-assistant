<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1XPuACzIkt93F4QunEoqNJlvTI494Qqyu

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. (Optional for local only) You can skip AI features or run against a local proxy. This app now calls a Vercel serverless API at `/api/ai` which uses SiliconFlow. For local testing without deploying, you can:
   - Use `vercel dev` (requires Vercel CLI) and set env `SILICONFLOW_API_KEY` locally, or
   - Stub responses in code (already has fallbacks in some places).
3. Run the app:
   `npm run dev`

## Deploy on Vercel (SiliconFlow proxy)

The app now uses a Vercel Function proxy (`api/ai.ts`) to call SiliconFlow safely, so your key never goes to the browser.

1. Push this folder to a Git repo (GitHub/GitLab/Bitbucket).
2. Import the repo in Vercel, framework: Vite. Build command: `npm run build`, Output directory: `dist`.
3. In Vercel Project Settings → Environment Variables, add:
   - `SILICONFLOW_API_KEY` = your SiliconFlow API key
   - (Optional) `SILICONFLOW_BASE_URL` = `https://api.siliconflow.cn/v1` (default)
   - (Optional) `SILICONFLOW_MODEL` = default is `Qwen/Qwen2.5-14B-Instruct` (balanced quality/cost). You may switch to other general models you have enabled.
   4. Redeploy. Open the URL in Safari on iPhone → Share → Add to Home Screen for an app-like experience.

## PWA (Add to Home Screen)

This project ships with PWA enabled via `vite-plugin-pwa`:
- Manifest registered with `display: standalone`, full-screen on iOS/Android.
- Service Worker auto-updates (no manual reload required).

已内置图标（已放在 `public/`，开箱即用）:
- `public/apple-touch-icon.png` (180x180)
- `public/icon-192.png` 和 `public/icon-512.png`
- `public/maskable-512.png`（maskable）

iPhone 全屏体验步骤：
- 用 Safari 打开部署后的站点 → 分享 → 添加到主屏幕。
- 首次打开会缓存核心静态资源，后续离线也能打开基础界面。
