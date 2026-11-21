//! Mastodon API の呼び出し。

use std::sync::LazyLock;

use reqwest::{multipart, Client, Method, Response};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::{json, Value};

use crate::store::OAuthApp;

pub const OAUTH_SCOPES: &str = "read:accounts write:statuses write:media";
pub const OAUTH_REDIRECT_URI: &str = "tootgun://oauth";

static CLIENT: LazyLock<Client> = LazyLock::new(|| {
    Client::builder()
        .user_agent(concat!("TootGun/", env!("CARGO_PKG_VERSION")))
        .build()
        .expect("HTTP クライアントを作成できません")
});

/// APIリクエストがMastodon本体ではなく、その手前のCDN/WAF等のBot対策に止められた場合にtrue。
/// Mastodon APIはエラー時も必ずJSON(`{"error": ...}`)を返すため、403でHTMLが返ってきたら
/// 「人間確認ページ」のような保護機構が割り込んだと判断できる（製品を問わない）。
fn is_blocked_by_bot_protection(res: &Response) -> bool {
    let content_type = res
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    res.status() == reqwest::StatusCode::FORBIDDEN && content_type.contains("text/html")
}

fn bot_protection_message(server_url: &str) -> String {
    let host = url::Url::parse(server_url)
        .ok()
        .and_then(|u| u.host_str().map(str::to_owned))
        .unwrap_or_else(|| server_url.to_owned());
    format!(
        "{host} はサーバー手前のBot対策（人間確認など）によりアプリからのAPIアクセスがブロックされています。\
         VPNやプロキシを使っている場合は外して再試行してください。\
         それでも変わらなければ、サーバー管理者に /api/ と /oauth/ を保護の対象外にするよう依頼してください"
    )
}

#[derive(Deserialize, Default)]
struct MastodonErrorBody {
    error: Option<String>,
    error_description: Option<String>,
}

/// エラーレスポンスから人が読めるメッセージを組み立てる
async fn error_message(res: Response) -> String {
    let status = res.status().as_u16();
    let body: MastodonErrorBody = res.json().await.unwrap_or_default();
    let detail = body
        .error_description
        .filter(|s| !s.is_empty())
        .or(body.error.filter(|s| !s.is_empty()));
    match detail {
        Some(detail) => format!("{detail} (HTTP {status})"),
        None => format!("HTTP {status}"),
    }
}

fn network_error(e: reqwest::Error) -> String {
    format!("通信に失敗しました: {e}")
}

pub enum Body {
    None,
    Json(Value),
    Multipart(multipart::Form),
}

/// Mastodon API を呼び出し、JSON レスポンスを返す。
/// 非2xx なら Mastodon のエラーメッセージを返す。
pub async fn request<T: DeserializeOwned>(
    server_url: &str,
    path: &str,
    method: Method,
    body: Body,
    token: Option<&str>,
) -> Result<T, String> {
    let mut req = CLIENT.request(method, format!("{server_url}{path}"));
    if let Some(token) = token {
        req = req.bearer_auth(token);
    }
    req = match body {
        Body::None => req,
        Body::Json(value) => req.json(&value),
        Body::Multipart(form) => req.multipart(form),
    };

    let res = req.send().await.map_err(network_error)?;
    if is_blocked_by_bot_protection(&res) {
        return Err(bot_protection_message(server_url));
    }
    if !res.status().is_success() {
        return Err(error_message(res).await);
    }
    res.json::<T>()
        .await
        .map_err(|e| format!("レスポンスを読めません: {e}"))
}

// ---- 認証済みAPI用の型 ----

#[derive(Deserialize)]
pub struct PostParams {
    pub status: String,
    pub visibility: Option<String>,
    pub spoiler_text: Option<String>,
    pub media_ids: Option<Vec<String>>,
}

/// 投稿APIに送る JSON。空の項目は送らない
pub fn post_body(params: PostParams) -> Value {
    let mut body = json!({
        "status": params.status,
        "visibility": params.visibility.filter(|v| !v.is_empty()).unwrap_or_else(|| "public".into()),
    });
    if let Some(spoiler) = params.spoiler_text.filter(|s| !s.is_empty()) {
        body["spoiler_text"] = json!(spoiler);
    }
    if let Some(ids) = params.media_ids.filter(|ids| !ids.is_empty()) {
        body["media_ids"] = json!(ids);
    }
    body
}

#[derive(Deserialize)]
pub struct RawCustomEmoji {
    shortcode: String,
    url: String,
    static_url: String,
    visible_in_picker: Option<bool>,
    category: Option<String>,
}

#[derive(Serialize)]
pub struct CustomEmoji {
    shortcode: String,
    url: String,
    static_url: String,
    category: Option<String>,
}

/// ピッカー非表示の絵文字を除外し、画面側の型に揃える
pub fn to_custom_emojis(list: Vec<RawCustomEmoji>) -> Vec<CustomEmoji> {
    list.into_iter()
        .filter(|e| e.visible_in_picker != Some(false))
        .map(|e| CustomEmoji {
            shortcode: e.shortcode,
            url: e.url,
            static_url: e.static_url,
            category: e.category,
        })
        .collect()
}

pub async fn verify_credentials(server_url: &str, token: &str) -> Result<Value, String> {
    request(
        server_url,
        "/api/v1/accounts/verify_credentials",
        Method::GET,
        Body::None,
        Some(token),
    )
    .await
}

// ---- OAuth ----

/// TootGun をアプリとして登録し、client_id / client_secret を得る
pub async fn register_app(server_url: &str) -> Result<OAuthApp, String> {
    #[derive(Deserialize)]
    struct Registered {
        client_id: String,
        client_secret: String,
    }
    let data: Registered = request(
        server_url,
        "/api/v1/apps",
        Method::POST,
        Body::Json(json!({
            "client_name": "TootGun",
            "redirect_uris": OAUTH_REDIRECT_URI,
            "scopes": OAUTH_SCOPES,
            "website": "https://github.com/otera/TootGun",
        })),
        None,
    )
    .await
    .map_err(|e| format!("アプリ登録失敗: {e}"))?;
    Ok(OAuthApp {
        client_id: data.client_id,
        client_secret: data.client_secret,
        scopes: Some(OAUTH_SCOPES.to_owned()),
    })
}

/// キャッシュ済みのアプリ登録がサーバー側でまだ有効か確認する。
/// Mastodonはトークンが紐づいていないアプリ登録を定期的に自動削除するため、
/// 古いclient_id/client_secretのまま認証を始めるとトークン交換で401になる。
/// ネットワークエラー等で判定できない場合は有効とみなす（本番の認証で改めて失敗させる）。
pub async fn validate_app_credentials(server_url: &str, oauth_app: &OAuthApp) -> bool {
    let res = CLIENT
        .post(format!("{server_url}/oauth/token"))
        .json(&json!({
            "grant_type": "client_credentials",
            "client_id": oauth_app.client_id,
            "client_secret": oauth_app.client_secret,
            "scope": "read:accounts",
        }))
        .send()
        .await;
    match res {
        Ok(res) => res.status().is_success(),
        Err(_) => true,
    }
}

pub struct TokenExchangeError {
    pub message: String,
    /// クライアント認証失敗（HTTP 401）。キャッシュ済みアプリ登録の失効を意味する
    pub app_revoked: bool,
}

/// 認可コードをアクセストークンに交換する（PKCE）
pub async fn exchange_code_for_token(
    server_url: &str,
    oauth_app: &OAuthApp,
    code: &str,
    code_verifier: &str,
) -> Result<String, TokenExchangeError> {
    let res = CLIENT
        .post(format!("{server_url}/oauth/token"))
        .json(&json!({
            "grant_type": "authorization_code",
            "code": code,
            "client_id": oauth_app.client_id,
            "client_secret": oauth_app.client_secret,
            "redirect_uri": OAUTH_REDIRECT_URI,
            "code_verifier": code_verifier,
        }))
        .send()
        .await
        .map_err(|e| TokenExchangeError {
            message: network_error(e),
            app_revoked: false,
        })?;

    if !res.status().is_success() {
        let app_revoked = res.status() == reqwest::StatusCode::UNAUTHORIZED;
        return Err(TokenExchangeError {
            message: format!("トークン取得失敗: {}", error_message(res).await),
            app_revoked,
        });
    }

    #[derive(Deserialize)]
    struct TokenResponse {
        access_token: String,
    }
    let data: TokenResponse = res.json().await.map_err(|e| TokenExchangeError {
        message: format!("トークン取得失敗: {e}"),
        app_revoked: false,
    })?;
    Ok(data.access_token)
}

pub fn build_authorize_url(
    server_url: &str,
    client_id: &str,
    code_challenge: &str,
) -> Result<url::Url, String> {
    url::Url::parse_with_params(
        &format!("{server_url}/oauth/authorize"),
        &[
            ("client_id", client_id),
            ("redirect_uri", OAUTH_REDIRECT_URI),
            ("response_type", "code"),
            ("scope", OAUTH_SCOPES),
            ("code_challenge", code_challenge),
            ("code_challenge_method", "S256"),
        ],
    )
    .map_err(|e| format!("サーバーURLが不正です: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn post_body_omits_empty_fields() {
        let body = post_body(PostParams {
            status: "hello".into(),
            visibility: None,
            spoiler_text: Some(String::new()),
            media_ids: Some(vec![]),
        });
        assert_eq!(body, json!({ "status": "hello", "visibility": "public" }));
    }

    #[test]
    fn custom_emojis_hide_unlisted() {
        let list = vec![
            RawCustomEmoji {
                shortcode: "a".into(),
                url: "u".into(),
                static_url: "s".into(),
                visible_in_picker: Some(false),
                category: None,
            },
            RawCustomEmoji {
                shortcode: "b".into(),
                url: "u".into(),
                static_url: "s".into(),
                visible_in_picker: None,
                category: Some("cat".into()),
            },
        ];
        let result = to_custom_emojis(list);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].shortcode, "b");
    }

    #[test]
    fn authorize_url_has_pkce_params() {
        let url = build_authorize_url("https://example.com", "id", "challenge").unwrap();
        assert_eq!(url.path(), "/oauth/authorize");
        let pairs: Vec<_> = url.query_pairs().into_owned().collect();
        assert!(pairs.contains(&("code_challenge_method".into(), "S256".into())));
        assert!(pairs.contains(&("redirect_uri".into(), OAUTH_REDIRECT_URI.into())));
    }
}
