# TootGun

**1秒に3発、想いをブチ込め。**

Mastodon向け高速投稿デスクトップクライアント。  
キーボード一発で投稿できる、シンプルでスピーディーな銃口型UIが特徴。

![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey)
![Tauri](https://img.shields.io/badge/Tauri-2-24c8db)
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
4. ログイン用のウィンドウが開くので、MastodonアカウントでTootGunへのアクセスを許可
5. ウィンドウが自動で閉じ、接続完了

## 開発

Node.js（`mise.toml` で指定）と Rust（[rustup](https://rustup.rs/)）が必要。

```bash
# 依存関係インストール
npm install

# 開発用に起動（画面はホットリロード、Rust は変更時に再ビルド）
npm run dev

# Lint / 型チェック / フォーマット / テストをまとめて実行
npm run check

# テストのみ
npm run test

# パッケージ作成（実行中の OS 向け。macOS は .app / .dmg、Windows はインストーラー .exe）
# 出力先: src-tauri/target/release/bundle/
npm run build
```

## 技術スタック

- **Tauri 2** — デスクトップアプリの土台。Mastodon API・OAuth・設定保存は Rust 側で行い、アクセストークンは画面側へ渡さない
- **Vite** — 画面のビルド＆HMR
- **React** — UI
- **tauri-plugin-store** — 設定永続化（サーバーURL、OAuthトークン、ハッシュタグ、履歴）

## プロジェクト構成

```
src-tauri/                   # Rust 側（アプリ本体）
├── tauri.conf.json          # アプリ名・ビルド・バンドルの設定
├── capabilities/            # 画面側に許可する Tauri の機能
└── src/
    ├── lib.rs               # エントリ（プラグインとコマンドの登録）
    ├── commands.rs          # 画面側から呼べるコマンド
    ├── mastodon.rs          # Mastodon API 呼び出し
    ├── oauth.rs             # OAuth（PKCE）フロー
    ├── store.rs             # 設定の永続化。認証情報はここに閉じる
    └── window.rs            # メインウィンドウの生成・サイズ管理
src/
├── shared/types.ts          # 画面側と Rust 側でやり取りするデータの型
└── renderer/src/
    ├── api/                 # window.api（Rust 側のコマンド呼び出し）とその型
    ├── App.tsx              # 画面ルーティング
    ├── components/
    │   ├── Settings.tsx     # 接続設定
    │   ├── Composer.tsx     # 投稿画面
    │   ├── HistoryPanel.tsx # 投稿ログ
    │   ├── AttachmentList.tsx
    │   ├── UndoBar.tsx      # 投稿の取り消し
    │   ├── HashtagPanel.tsx
    │   ├── EmojiPicker.tsx  # 絵文字ピッカー
    │   ├── EmojiAutocomplete.tsx # ショートコード補完
    │   └── SparkEffect.tsx
    ├── hooks/               # Composer から切り出した状態管理
    │   ├── useAttachments.ts
    │   ├── useCustomEmojis.ts
    │   ├── useEmojiInput.ts
    │   ├── useHistoryPanel.ts
    │   └── useFireEffect.ts
    ├── emoji/emojiIndex.ts  # ショートコード検出・検索
    └── utils/formatTime.ts
```

## ライセンス

MIT
