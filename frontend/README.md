# AI Pet Frontend

Next.js + React + TypeScript のフロントエンドです。Firebase Hosting へ static export して配信します。

## Deployed URLs

| Environment | URL |
|-------------|-----|
| Production (`main`) | https://gen-lang-client-0099285268.web.app |
| Development (`dev`) | https://gen-lang-client-0099285268-dev.web.app |

PR preview URLs are posted to each PR as a `Deploy Preview` comment.

## Local Development

```bash
npm install
cp .env.example .env.local
npm run dev
```

http://localhost:3000 を開きます。ローカル開発時の `/api/*` は `next.config.ts` の rewrites で `http://localhost:8080/*` に転送します。Firebase 環境変数が未設定の場合、API クライアントはローカル開発用の `Bearer dev-token` を送ります。

## Build

```bash
npm run build
```

出力先は `out/` です。Firebase Hosting はリポジトリルートの `firebase.json` で `frontend/out` を公開します。
