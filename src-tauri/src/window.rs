//! メインウィンドウの作成とサイズ操作（Electron 版の src/main/window.ts に相当）。

use tauri::{
    window::Color, AppHandle, LogicalSize, Manager, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder, WindowEvent,
};

use crate::store;

pub const MAIN_WINDOW_LABEL: &str = "main";
const MIN_WIDTH: f64 = 420.0;
const MIN_HEIGHT: f64 = 450.0;

fn saved_size(app: &AppHandle, key: &str) -> Option<f64> {
    store::get(app, key).ok().flatten()?.as_f64()
}

pub fn create_main_window(app: &AppHandle) -> tauri::Result<()> {
    let width = saved_size(app, "windowWidth")
        .unwrap_or(MIN_WIDTH)
        .max(MIN_WIDTH);
    let height = saved_size(app, "windowHeight")
        .unwrap_or(MIN_HEIGHT)
        .max(MIN_HEIGHT);

    let builder =
        WebviewWindowBuilder::new(app, MAIN_WINDOW_LABEL, WebviewUrl::App("index.html".into()))
            .title("TootGun")
            .inner_size(width, height)
            .min_inner_size(MIN_WIDTH, MIN_HEIGHT)
            .background_color(Color(0x0d, 0x0d, 0x0d, 0xff))
            .theme(Some(tauri::Theme::Dark));

    // macOS: タイトルバーを隠して信号機ボタンだけを残す（Electron 版の hiddenInset 相当）
    #[cfg(target_os = "macos")]
    let builder = builder
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true);

    let window = builder.build()?;

    // ウィンドウサイズを保存する（書き込みは store 側でまとめて行われる）
    let handle = app.clone();
    let win = window.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::Resized(size) = event {
            let Ok(scale) = win.scale_factor() else {
                return;
            };
            let logical = size.to_logical::<f64>(scale);
            if let Ok(store) = store::open(&handle) {
                store.set("windowWidth", logical.width.round());
                store.set("windowHeight", logical.height.round());
            }
        }
    });
    Ok(())
}

pub fn main_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    app.get_webview_window(MAIN_WINDOW_LABEL)
        .ok_or_else(|| "メインウィンドウがありません".to_owned())
}

/// 高さはそのまま、幅だけ変更する（画面幅を超えない）
pub fn set_width(app: &AppHandle, width: f64) -> Result<(), String> {
    let window = main_window(app)?;
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    let current = window
        .inner_size()
        .map_err(|e| e.to_string())?
        .to_logical::<f64>(scale);
    let screen_width = window
        .current_monitor()
        .ok()
        .flatten()
        .map(|m| m.work_area().size.to_logical::<f64>(m.scale_factor()).width);
    let width = match screen_width {
        Some(max) => width.min(max),
        None => width,
    };
    window
        .set_size(LogicalSize::new(width, current.height))
        .map_err(|e| e.to_string())
}
