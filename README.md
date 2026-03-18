# TootGun

**1秒に3発、想いをブチ込め。**

Mastodon向け高速投稿デスクトップクライアント。キーボード一発で投稿できる、シンプルでスピーディーな銃口型UIが特徴。

![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey)
![Electron](https://img.shields.io/badge/Electron-29-blue)
![React](https://img.shields.io/badge/React-18-61dafb)

## 特徴

- **⌘Enter（Ctrl+Enter）で即投稿** — マウス不要、指が覚える
- **ハッシュタグ管理** — よく使うタグをチップ登録してトグルで切替
- **公開範囲選択** — 公開 / 未収載 / フォロワーのみ / ダイレクト
- **投稿エフェクト** — 画面シェイク＋マズルフラッシュ＋スパーク
- **投稿履歴** — 直近3件を表示（10件まで保存）
- **ガンメタルダークテーマ** — 目に優しいフルダーク

## 動作環境

| OS | 対応 |
|---|---|
| macOS 12+ | ✅ |
| Windows 10/11 | ✅ |

## セットアップ

### 1. アクセストークンの取得

1. MastodonインスタンスのWeb UIにログイン
2. **設定 → 開発 → 新規アプリ** を開く
3. アプリ名を入力し、以下のスコープにチェック：
   - `read:accounts`
   - `write:statuses`
4. 作成後に表示される **アクセストークン** をコピー

### 2. アプリへの接続

1. TootGunを起動
2. サーバーURL（例: `https://mastodon.social`）を入力
3. コピーしたアクセストークンを貼り付け
4. **接続する** をクリック

## 開発

```bash
# 依存関係インストール
npm install

# 開発サーバー起動（ホットリロード）
npm run dev

# ビルド
npm run build

# パッケージ作成
npm run dist:mac   # macOS (.dmg)
npm run dist:win   # Windows (.exe)
```

## 技術スタック

- **Electron 29** — クロスプラットフォームデスクトップ
- **electron-vite 2** — 高速ビルド＆HMR
- **React 18** — UI
- **electron-store** — 設定永続化（サーバーURL、トークン、ハッシュタグ、履歴）

## プロジェクト構成

```
src/
├── main/index.js          # メインプロセス（IPC、Mastodon API呼び出し）
├── preload/index.js       # コンテキストブリッジ
└── renderer/src/
    ├── App.jsx            # 画面ルーティング
    └── components/
        ├── Settings.jsx   # 接続設定
        ├── Composer.jsx   # 投稿画面
        ├── HashtagPanel.jsx
        └── SparkEffect.jsx
```

## ライセンス

MIT
