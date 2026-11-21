//! TootGun の Tauri 版バックエンド。
//! アクセストークンはこのプロセスの外（画面側）へ出さない。

mod commands;
mod mastodon;
mod oauth;
mod secrets;
mod store;
mod window;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(oauth::PendingOAuth::default())
        .setup(|app| {
            secrets::init()?;
            // 平文で残っている旧形式のトークンを移す。失敗しても起動は続ける
            if let Err(e) = store::migrate_plaintext_secrets(app.handle()) {
                eprintln!("認証情報の移行に失敗しました: {e}");
            }
            window::create_main_window(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::store_get,
            commands::store_set,
            commands::window_set_always_on_top,
            commands::window_set_width,
            commands::mastodon_post,
            commands::mastodon_delete,
            commands::mastodon_upload_media,
            commands::mastodon_update_media,
            commands::mastodon_custom_emojis,
            commands::mastodon_verify,
            commands::mastodon_logout,
            commands::mastodon_start_oauth,
        ])
        .run(tauri::generate_context!())
        .expect("TootGun の起動に失敗しました");
}
