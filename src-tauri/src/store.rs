//! 設定と認証情報の保存。

use std::sync::Arc;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Wry};
use tauri_plugin_store::{Store, StoreExt};

use crate::secrets;

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
// 接続先（serverUrl）は秘密ではないので設定ファイルに、トークンは OS の資格情報ストアに保存する

const TOKEN_KEY: &str = "token";

pub struct Credentials {
    pub server_url: String,
    pub token: String,
}

/// 保存済みの接続先とトークン。未認証なら None
pub fn get_credentials(app: &AppHandle) -> Option<Credentials> {
    let server_url = open(app).ok()?.get("serverUrl")?.as_str()?.to_owned();
    let token = match secrets::get(TOKEN_KEY) {
        Ok(token) => token?,
        Err(e) => {
            eprintln!("{e}");
            return None;
        }
    };
    Some(Credentials { server_url, token })
}

pub fn set_credentials(app: &AppHandle, credentials: &Credentials) -> Result<(), String> {
    secrets::set(TOKEN_KEY, &credentials.token)?;
    let store = open(app)?;
    store.set("serverUrl", credentials.server_url.clone());
    save(&store)
}

pub fn clear_credentials(app: &AppHandle) -> Result<(), String> {
    secrets::delete(TOKEN_KEY)?;
    let store = open(app)?;
    store.delete("serverUrl");
    save(&store)
}

// ---- アプリ登録のキャッシュ ----
// client_secret を含むので、これも資格情報ストアに JSON で保存する

/// Mastodon に登録したアプリの認証情報（サーバーごとにキャッシュする）
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OAuthApp {
    pub client_id: String,
    pub client_secret: String,
    pub scopes: Option<String>,
}

const OAUTH_APP_PREFIX: &str = "oauth_app_";

fn oauth_app_key(server_url: &str) -> String {
    format!("{OAUTH_APP_PREFIX}{server_url}")
}

pub fn get_oauth_app(server_url: &str) -> Option<OAuthApp> {
    let json = secrets::get(&oauth_app_key(server_url)).ok()??;
    serde_json::from_str(&json).ok()
}

pub fn set_oauth_app(server_url: &str, oauth_app: &OAuthApp) -> Result<(), String> {
    let json = serde_json::to_string(oauth_app).map_err(|e| e.to_string())?;
    secrets::set(&oauth_app_key(server_url), &json)
}

pub fn delete_oauth_app(server_url: &str) -> Result<(), String> {
    secrets::delete(&oauth_app_key(server_url))
}

// ---- 旧形式からの移行 ----

/// 以前は token / oauth_app_* を設定ファイルに平文で保存していた。
/// 資格情報ストアへ移し、移せたものだけ設定ファイルから消す
pub fn migrate_plaintext_secrets(app: &AppHandle) -> Result<(), String> {
    let store = open(app)?;
    let mut changed = false;
    for key in store.keys() {
        if key != TOKEN_KEY && !key.starts_with(OAUTH_APP_PREFIX) {
            continue;
        }
        let value = match store.get(&key) {
            Some(Value::String(token)) => token,
            Some(value) => value.to_string(),
            None => continue,
        };
        secrets::set(&key, &value)?;
        store.delete(&key);
        changed = true;
    }
    if changed {
        save(&store)?;
    }
    Ok(())
}
