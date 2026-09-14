# 公開(Render)

Render の無料枠の Web サービス1つで、画面とオンライン対戦のサーバーを同じ URL から配る。
設定の正本はリポジトリ直下の `render.yaml`。

## 仕組み

- ビルド: `apps/web` を Vite でビルドし、`apps/web/dist` に出力する
- 起動: `apps/server` を起動する。サーバーは `apps/web/dist` があれば画面も配る(`apps/server/src/static.ts`)
  - `/socket.io/` はオンライン対戦の通信、`/healthz` は Render のヘルスチェック、それ以外は画面
  - 画面は同じ URL のサーバーにつなぐので、`VITE_SERVER_URL` や `SRM_CORS_ORIGINS` の設定は不要
- `main` にマージすると自動で再デプロイされる

## 初回の手順

1. Render のダッシュボードで **New > Blueprint** を選ぶ
2. このリポジトリを選ぶと `render.yaml` が読み込まれるので、そのまま作成する
3. ビルドが終わると `https://<サービス名>.onrender.com` で遊べる

## 無料枠の注意

- 15分アクセスがないと停止し、次に開いたときに起動まで1分ほどかかる
- 部屋と対戦はサーバーのメモリにだけあるので、停止・再起動・再デプロイで消える。対戦中の人がいるときに `main` へマージしない
- リージョンはシンガポール(日本から一番近い)

## 本番と同じ構成を手元で確認する

```bash
pnpm build
```

```bash
pnpm --filter @srm/server start
```

`http://localhost:8787` を開く。

## 環境変数(任意)

| 名前 | 既定値 | 内容 |
|---|---|---|
| `PORT` | 8787 | 待ち受けるポート。Render が自動で設定する |
| `SRM_WEB_DIR` | `apps/web/dist` | 配る画面のフォルダー |
| `SRM_TIMER_BASE_MS` | 30000 | 1回の基本時間 |
| `SRM_TIMER_RESERVE_MS` | 120000 | 持ち時間 |
