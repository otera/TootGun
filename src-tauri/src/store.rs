//! 設定と認証情報の保存（Electron 版の src/main/store.ts に相当）。

use std::sync::Arc;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Wry};
use tauri_plugin_store::{Store, StoreExt};

const STORE_FILE: &str = "config.json";

/// 画面側に公開する設定キー。認証情報（serverUrl / token / oauth_app_*）は含めない
const RENDERER_STORE_KEYS: &[&str] = &[
    "hashtags",
    "activeHashtags",
    "lastPosts",
    "visibility",
    "alwaysOnTop",
    "historyOpen",
    "recentEmojis",
    "customEmojisCache",
];

pub fn open(app: &AppHandle) -> Result<Arc<Store<Wry>>, String> {
    app.store(STORE_FILE)
        .map_err(|e| format!("設定ファイルを開けません: {e}"))
}

fn save(store: &Store<Wry>) -> Result<(), String> {
    store
        .save()
        .map_err(|e| format!("設定を保存できません: {e}"))
}

/// 画面側から渡されたキーが公開対象か検証する。任意キーへのアクセスを防ぐ
pub fn assert_renderer_key(key: &str) -> Result<(), String> {
    if RENDERER_STORE_KEYS.contains(&key) {
        Ok(())
    } else {
        Err(format!("画面側からアクセスできない設定です: {key}"))
    }
}

pub fn get(app: &AppHandle, key: &str) -> Result<Option<Value>, String> {
    Ok(open(app)?.get(key))
}

pub fn set(app: &AppHandle, key: &str, value: Value) -> Result<(), String> {
    let store = open(app)?;
    store.set(key, value);
    save(&store)
}

// ---- 認証情報 ----

pub struct Credentials {
    pub server_url: String,
    pub token: String,
}

/// 保存済みの接続先とトークン。未認証なら None
pub fn get_credentials(app: &AppHandle) -> Option<Credentials> {
    let store = open(app).ok()?;
    let server_url = store.get("serverUrl")?.as_str()?.to_owned();
    let token = store.get("token")?.as_str()?.to_owned();
    Some(Credentials { server_url, token })
}

pub fn set_credentials(app: &AppHandle, credentials: &Credentials) -> Result<(), String> {
    let store = open(app)?;
    store.set("serverUrl", credentials.server_url.clone());
    store.set("token", credentials.token.clone());
    save(&store)
}

pub fn clear_credentials(app: &AppHandle) -> Result<(), String> {
    let store = open(app)?;
    store.delete("serverUrl");
    store.delete("token");
    save(&store)
}

// ---- アプリ登録のキャッシュ ----

/// Mastodon に登録したアプリの認証情報（サーバーごとにキャッシュする）
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OAuthApp {
    pub client_id: String,
    pub client_secret: String,
    pub scopes: Option<String>,
}

fn oauth_app_key(server_url: &str) -> String {
    format!("oauth_app_{server_url}")
}

pub fn get_oauth_app(app: &AppHandle, server_url: &str) -> Option<OAuthApp> {
    let value = open(app).ok()?.get(oauth_app_key(server_url))?;
    serde_json::from_value(value).ok()
}

pub fn set_oauth_app(
    app: &AppHandle,
    server_url: &str,
    oauth_app: &OAuthApp,
) -> Result<(), String> {
    let store = open(app)?;
    let value = serde_json::to_value(oauth_app).map_err(|e| e.to_string())?;
    store.set(oauth_app_key(server_url), value);
    save(&store)
}

pub fn delete_oauth_app(app: &AppHandle, server_url: &str) -> Result<(), String> {
    let store = open(app)?;
    store.delete(oauth_app_key(server_url));
    save(&store)
}
