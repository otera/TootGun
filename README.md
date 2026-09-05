# TootGun

**1秒に3発、想いをブチ込め。**

Mastodon向け高速投稿デスクトップクライアント。  
キーボード一発で投稿できる、シンプルでスピーディーな銃口型UIが特徴。

![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey)
![Electron](https://img.shields.io/badge/Electron-43-blue)
![React](https://img.shields.io/badge/React-19-61dafb)

## 特徴

- **⌘Enter（Ctrl+Enter）で即投稿** — マウス不要、指が覚える
- **ハッシュタグ管理** — よく使うタグをチップ登録してトグルで切替
- **公開範囲選択** — 公開 / 未収載 / フォロワーのみ / ダイレクト
- **カスタム絵文字挿入** — 😀ボタンでピッカーを開き、サーバー独自の絵文字を挿入（標準絵文字はIMEから）
- **ショートコード補完** — `:str_` のように途中まで入力すると候補をポップアップ表示（↑↓で選択、Enter/Tabで確定）
- **投稿エフェクト** — 画面シェイク＋マズルフラッシュ＋スパーク
- **投稿履歴** — 直近10件を表示
- **ガンメタルダークテーマ** — 目に優しいフルダーク

## 動作環境

| OS | 対応 |
|---|---|
| macOS 12+ | ✅ |
| Windows 10/11 | ✅ |

## セットアップ

1. TootGunを起動
2. サーバーURL（例: `https://mastodon.social`）を入力
3. **接続する** をクリック
4. ブラウザが開くので、MastodonアカウントでTootGunへのアクセスを許可
5. 自動的にアプリへ戻り、接続完了

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

- **Electron** — クロスプラットフォームデスクトップ
- **electron-vite** — 高速ビルド＆HMR
- **React** — UI
- **electron-store** — 設定永続化（サーバーURL、OAuthトークン、ハッシュタグ、履歴）

## プロジェクト構成

```
src/
├── main/index.ts          # メインプロセス（IPC、Mastodon API呼び出し）
├── preload/index.ts       # コンテキストブリッジ
└── renderer/src/
    ├── App.tsx            # 画面ルーティング
    └── components/
        ├── Settings.tsx   # 接続設定
        ├── Composer.tsx   # 投稿画面
        ├── HashtagPanel.tsx
        ├── EmojiPicker.tsx      # 絵文字ピッカー
        ├── EmojiAutocomplete.tsx # ショートコード補完
        └── SparkEffect.tsx
```

## ライセンス

MIT
