//! OAuth（PKCE）によるログイン。

use std::sync::Mutex;

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use serde_json::json;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::mastodon::{self, OAUTH_REDIRECT_URI, OAUTH_SCOPES};
use crate::store::{self, Credentials, OAuthApp};

const AUTH_WINDOW_LABEL: &str = "oauth";
/// 画面側（Settings）が購読しているイベント名
const OAUTH_CALLBACK_EVENT: &str = "oauth:callback";

struct Pending {
    server_url: String,
    oauth_app: OAuthApp,
    code_verifier: String,
}

/// 認可ウィンドウを開いてからコールバックが届くまでの状態
#[derive(Default)]
pub struct PendingOAuth(Mutex<Option<Pending>>);

fn is_oauth_callback_url(url: &str) -> bool {
    url.starts_with(OAUTH_REDIRECT_URI)
}

fn generate_code_verifier() -> Result<String, String> {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).map_err(|e| format!("乱数を生成できません: {e}"))?;
    Ok(URL_SAFE_NO_PAD.encode(bytes))
}

fn generate_code_challenge(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

/// キャッシュ済みのアプリ登録を返す。失効していたり要求スコープが変わっていれば捨てて再登録する。
async fn resolve_app(server_url: &str) -> Result<OAuthApp, String> {
    if let Some(cached) = store::get_oauth_app(server_url) {
        if cached.scopes.as_deref() == Some(OAUTH_SCOPES)
            && mastodon::validate_app_credentials(server_url, &cached).await
        {
            return Ok(cached);
        }
    }
    store::delete_oauth_app(server_url)?;
    let oauth_app = mastodon::register_app(server_url).await?;
    store::set_oauth_app(server_url, &oauth_app)?;
    Ok(oauth_app)
}

/// アプリ登録を確認したうえで認可ウィンドウを開く。
/// 認可後のリダイレクト（tootgun://oauth?code=...）はウィンドウの遷移を横取りして受け取り、
/// 結果は oauth:callback イベントで画面側に通知する（トークンそのものは通知しない）。
pub async fn start(app: AppHandle, server_url: String) -> Result<(), String> {
    let oauth_app = resolve_app(&server_url).await?;

    let code_verifier = generate_code_verifier()?;
    let code_challenge = generate_code_challenge(&code_verifier);
    let authorize_url =
        mastodon::build_authorize_url(&server_url, &oauth_app.client_id, &code_challenge)?;

    *app.state::<PendingOAuth>().0.lock().unwrap() = Some(Pending {
        server_url,
        oauth_app,
        code_verifier,
    });

    if let Some(existing) = app.get_webview_window(AUTH_WINDOW_LABEL) {
        let _ = existing.destroy();
    }

    let handle = app.clone();
    WebviewWindowBuilder::new(&app, AUTH_WINDOW_LABEL, WebviewUrl::External(authorize_url))
        .title("TootGun - 認証")
        .inner_size(800.0, 700.0)
        .on_navigation(move |url| {
            if !is_oauth_callback_url(url.as_str()) {
                return true;
            }
            let handle = handle.clone();
            let url = url.to_string();
            // ナビゲーションのコールバック内で窓を閉じると固まることがあるので、非同期で処理する
            tauri::async_runtime::spawn(async move {
                if let Some(window) = handle.get_webview_window(AUTH_WINDOW_LABEL) {
                    let _ = window.destroy();
                }
                handle_callback(&handle, &url).await;
            });
            false
        })
        .build()
        .map_err(|e| format!("認証ウィンドウを開けません: {e}"))?;
    Ok(())
}

async fn handle_callback(app: &AppHandle, url: &str) {
    let payload = match complete(app, url).await {
        Ok(account) => json!({ "account": account }),
        Err(error) => json!({ "error": error }),
    };
    let _ = app.emit_to("main", OAUTH_CALLBACK_EVENT, payload);
}

/// tootgun://oauth?code=... を受け取り、トークン交換とアカウント確認を行う
async fn complete(app: &AppHandle, url: &str) -> Result<serde_json::Value, String> {
    let parsed = url::Url::parse(url).map_err(|_| "無効なコールバックです".to_owned())?;
    let param = |name: &str| {
        parsed
            .query_pairs()
            .find(|(k, _)| k == name)
            .map(|(_, v)| v.into_owned())
    };
    if let Some(error) = param("error") {
        return Err(format!("認証エラー: {error}"));
    }
    let pending = app.state::<PendingOAuth>().0.lock().unwrap().take();
    let (Some(code), Some(pending)) = (param("code"), pending) else {
        return Err("無効なコールバックです".into());
    };

    let token = match mastodon::exchange_code_for_token(
        &pending.server_url,
        &pending.oauth_app,
        &code,
        &pending.code_verifier,
    )
    .await
    {
        Ok(token) => token,
        // アプリ登録の失効なら破棄し、次回の再登録で自己修復する
        Err(e) if e.app_revoked => {
            store::delete_oauth_app(&pending.server_url)?;
            return Err(
                "アプリ登録が失効していたためリセットしました。もう一度ログインしてください".into(),
            );
        }
        Err(e) => return Err(e.message),
    };

    let account = mastodon::verify_credentials(&pending.server_url, &token)
        .await
        .map_err(|e| format!("認証情報の確認失敗: {e}"))?;

    store::set_credentials(
        app,
        &Credentials {
            server_url: pending.server_url,
            token,
        },
    )?;
    Ok(account)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn code_challenge_matches_rfc7636_example() {
        // RFC 7636 Appendix B の例
        let verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
        assert_eq!(
            generate_code_challenge(verifier),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }

    #[test]
    fn code_verifier_is_43_chars() {
        assert_eq!(generate_code_verifier().unwrap().len(), 43);
    }

    #[test]
    fn detects_callback_url() {
        assert!(is_oauth_callback_url("tootgun://oauth?code=abc"));
        assert!(!is_oauth_callback_url(
            "https://example.com/oauth/authorize"
        ));
    }
}
