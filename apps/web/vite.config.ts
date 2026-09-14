import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// このファイルは Node で実行されるが、Web 側の tsconfig には Node の型を入れていないため最小限だけ宣言する
declare const process: { env: Record<string, string | undefined> }

/** 中継先のサーバーのポート。E2E テストでは開発中のサーバーと別のポートを使う */
const serverPort = process.env.SRM_SERVER_PORT ?? '8787'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    host: true,
    // VS Code のポート転送(Dev Tunnels)で遠隔の人に公開したときの URL を許可する。vite preview にも引き継がれる
    allowedHosts: ['.devtunnels.ms'],
    // 開発中は、オンライン対戦のサーバー(apps/server)へ中継する。
    // スマホから LAN 経由(http://<PCのIP>:5173)で開いても、同じ経路でサーバーにつながる
    proxy: {
      '/socket.io': { target: `http://localhost:${serverPort}`, ws: true },
    },
  },
})
