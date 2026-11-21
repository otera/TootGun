//! 画面側から呼べるコマンド。
//! 画面側の呼び出し口は src/renderer/src/api/index.ts。

use percent_encoding::percent_decode_str;
use reqwest::{multipart, Method};
use serde_json::{json, Value};
use tauri::{ipc::InvokeBody, AppHandle};

use crate::mastodon::{self, Body, PostParams, RawCustomEmoji};
use crate::store::{self, Credentials};
use crate::{oauth, window};

// ---- 設定（認証情報は対象外。キーは allowlist で検証する） ----

#[tauri::command]
pub fn store_get(app: AppHandle, key: String) -> Result<Option<Value>, String> {
    store::assert_renderer_key(&key)?;
    store::get(&app, &key)
}

#[tauri::command]
pub fn store_set(app: AppHandle, key: String, value: Value) -> Result<(), String> {
    store::assert_renderer_key(&key)?;
    store::set(&app, &key, value)
}

// ---- ウィンドウ ----

#[tauri::command]
pub fn window_set_always_on_top(app: AppHandle, flag: bool) -> Result<(), String> {
    window::main_window(&app)?
        .set_always_on_top(flag)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn window_set_width(app: AppHandle, width: f64) -> Result<(), String> {
    window::set_width(&app, width)
}

// ---- Mastodon API ----

fn credentials(app: &AppHandle) -> Result<Credentials, String> {
    store::get_credentials(app).ok_or_else(|| "未認証".to_owned())
}

/// 保存済みトークンで認証付きリクエストを行う
async fn authed<T: serde::de::DeserializeOwned>(
    app: &AppHandle,
    path: &str,
    method: Method,
    body: Body,
) -> Result<T, String> {
    let c = credentials(app)?;
    mastodon::request(&c.server_url, path, method, body, Some(&c.token)).await
}

#[tauri::command]
pub async fn mastodon_post(app: AppHandle, params: PostParams) -> Result<Value, String> {
    let body = Body::Json(mastodon::post_body(params));
    authed(&app, "/api/v1/statuses", Method::POST, body).await
}

#[tauri::command]
pub async fn mastodon_delete(app: AppHandle, id: String) -> Result<Value, String> {
    let path = format!("/api/v1/statuses/{}", encode_path_segment(&id));
    authed(&app, &path, Method::DELETE, Body::None).await
}

fn header(request: &tauri::ipc::Request<'_>, name: &str) -> Option<String> {
    let raw = request.headers().get(name)?.to_str().ok()?;
    Some(percent_decode_str(raw).decode_utf8_lossy().into_owned())
}

/// 画像などの添付ファイルをアップロードする。
/// ファイル本体は JSON にせずバイト列のまま受け取り、名前などはヘッダーで受け取る。
#[tauri::command]
pub async fn mastodon_upload_media(
    app: AppHandle,
    request: tauri::ipc::Request<'_>,
) -> Result<Value, String> {
    let InvokeBody::Raw(data) = request.body() else {
        return Err("ファイルデータがありません".into());
    };
    let data = data.clone();
    let filename = header(&request, "x-filename").unwrap_or_else(|| "file".into());
    let mime_type =
        header(&request, "x-mime-type").unwrap_or_else(|| "application/octet-stream".into());
    let description = header(&request, "x-description").filter(|d| !d.is_empty());

    let part = multipart::Part::bytes(data)
        .file_name(filename)
        .mime_str(&mime_type)
        .map_err(|e| format!("ファイル形式が不正です: {e}"))?;
    let mut form = multipart::Form::new().part("file", part);
    if let Some(description) = description {
        form = form.text("description", description);
    }
    authed(&app, "/api/v2/media", Method::POST, Body::Multipart(form)).await
}

/// アップロード後に説明文（Altテキスト）を変更/付与する
#[tauri::command]
pub async fn mastodon_update_media(
    app: AppHandle,
    id: String,
    description: String,
) -> Result<Value, String> {
    let path = format!("/api/v1/media/{}", encode_path_segment(&id));
    let body = Body::Json(json!({ "description": description }));
    authed(&app, &path, Method::PUT, body).await
}

/// サーバー独自絵文字の一覧。ピッカー非表示のものは除外する
#[tauri::command]
pub async fn mastodon_custom_emojis(app: AppHandle) -> Result<Value, String> {
    let list: Vec<RawCustomEmoji> =
        authed(&app, "/api/v1/custom_emojis", Method::GET, Body::None).await?;
    serde_json::to_value(mastodon::to_custom_emojis(list)).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn mastodon_verify(app: AppHandle) -> Result<Value, String> {
    authed(
        &app,
        "/api/v1/accounts/verify_credentials",
        Method::GET,
        Body::None,
    )
    .await
}

#[tauri::command]
pub fn mastodon_logout(app: AppHandle) -> Result<(), String> {
    store::clear_credentials(&app)
}

#[tauri::command]
pub async fn mastodon_start_oauth(app: AppHandle, server_url: String) -> Result<(), String> {
    oauth::start(app, server_url).await
}

/// ID をURLのパスに埋め込むときに、/ や ? などで別のAPIを指せないようにする
fn encode_path_segment(s: &str) -> String {
    percent_encoding::utf8_percent_encode(s, percent_encoding::NON_ALPHANUMERIC).to_string()
}
