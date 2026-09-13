/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** オンライン対戦サーバーの URL。未設定なら同じオリジン(開発中は Vite のプロキシ)に接続する */
  readonly VITE_SERVER_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
