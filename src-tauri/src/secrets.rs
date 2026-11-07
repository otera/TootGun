//! OS の資格情報ストアへの保存（macOS: 従来型キーチェーン / Windows: 資格情報マネージャー）。
//!
//! macOS は署名なしでも使える従来型（login）キーチェーンを使う。項目の読み取り許可は
//! アプリのコード署名にひも付くため、署名なしビルドでは再ビルドのたびに許可ダイアログが出る。
//! 読み取り回数を減らすため、一度読んだ値はプロセス内にキャッシュする。

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

use keyring_core::{Entry, Error};

/// キーチェーン上のサービス名（tauri.conf.json の identifier と合わせる）
const SERVICE: &str = "com.tootgun.client";

/// 起動時に一度だけ呼ぶ。OS の資格情報ストアを既定のストアにする
pub fn init() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let store = apple_native_keyring_store::keychain::Store::new();
    #[cfg(target_os = "windows")]
    let store = windows_native_keyring_store::Store::new();
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    return Err("この OS の資格情報ストアには対応していません".to_owned());

    #[cfg(any(target_os = "macos", target_os = "windows"))]
    {
        let store = store.map_err(|e| format!("資格情報ストアを開けません: {e}"))?;
        keyring_core::set_default_store(store);
        Ok(())
    }
}

fn cache() -> &'static Mutex<HashMap<String, Option<String>>> {
    static CACHE: OnceLock<Mutex<HashMap<String, Option<String>>>> = OnceLock::new();
    CACHE.get_or_init(Default::default)
}

fn entry(key: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, key).map_err(|e| format!("資格情報を扱えません: {e}"))
}

/// 保存済みの値。未保存なら None
pub fn get(key: &str) -> Result<Option<String>, String> {
    if let Some(cached) = cache().lock().unwrap().get(key) {
        return Ok(cached.clone());
    }
    let value = match entry(key)?.get_password() {
        Ok(value) => Some(value),
        Err(Error::NoEntry) => None,
        Err(e) => return Err(format!("資格情報を読み込めません: {e}")),
    };
    cache().lock().unwrap().insert(key.to_owned(), value.clone());
    Ok(value)
}

pub fn set(key: &str, value: &str) -> Result<(), String> {
    entry(key)?
        .set_password(value)
        .map_err(|e| format!("資格情報を保存できません: {e}"))?;
    cache()
        .lock()
        .unwrap()
        .insert(key.to_owned(), Some(value.to_owned()));
    Ok(())
}

/// 削除する。もともと無ければ何もしない
pub fn delete(key: &str) -> Result<(), String> {
    match entry(key)?.delete_credential() {
        Ok(()) | Err(Error::NoEntry) => {}
        Err(e) => return Err(format!("資格情報を削除できません: {e}")),
    }
    cache().lock().unwrap().insert(key.to_owned(), None);
    Ok(())
}
