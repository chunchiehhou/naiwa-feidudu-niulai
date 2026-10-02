use serde::{Deserialize, Serialize};
use std::{fs, path::{Path, PathBuf}, sync::Mutex};
use tauri::{
    menu::{CheckMenuItem, ContextMenu, Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, Window,
};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct Settings {
    version: u8,
    x: Option<f64>,
    y: Option<f64>,
    scale: f64,
    paused: bool,
    #[serde(default = "default_form")]
    form: String,
}

fn default_form() -> String {
    "naiwa".into()
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            version: 3,
            x: None,
            y: None,
            scale: 1.0,
            paused: false,
            form: default_form(),
        }
    }
}

struct PetState {
    settings: Mutex<Settings>,
    path: PathBuf,
    visible: Mutex<bool>,
    drag_offset: Mutex<Option<(i32, i32)>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Rect {
    x: i32,
    y: i32,
    width: i32,
    height: i32,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Layout {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    work_area: Rect,
}

fn load_settings(path: &Path) -> Settings {
    let source = if path.exists() {
        path.to_path_buf()
    } else {
        PathBuf::from(r"D:\naiwa\data\settings.json")
    };
    let mut settings = fs::read_to_string(source)
        .ok()
        .and_then(|text| serde_json::from_str::<Settings>(&text).ok())
        .unwrap_or_default();
    if ![0.8, 1.0, 1.2].contains(&settings.scale) {
        settings.scale = 1.0;
    }
    if !["naiwa", "feidudu", "niulai"].contains(&settings.form.as_str()) {
        settings.form = default_form();
    }
    if settings.version < 3 {
        settings.x = None;
        settings.y = None;
    }
    settings.version = 3;
    settings
}

fn save_settings(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<PetState>();
    let settings = state.settings.lock().map_err(|e| e.to_string())?.clone();
    fs::create_dir_all(state.path.parent().unwrap()).map_err(|e| e.to_string())?;
    let temp = state.path.with_extension("json.tmp");
    fs::write(
        &temp,
        serde_json::to_vec_pretty(&settings).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    fs::rename(&temp, &state.path).map_err(|e| e.to_string())
}

fn work_area(window: &Window) -> Result<Rect, String> {
    let monitor = window
        .current_monitor()
        .map_err(|e| e.to_string())?
        .or(window.primary_monitor().map_err(|e| e.to_string())?)
        .ok_or("No monitor")?;
    let area = monitor.work_area();
    Ok(Rect {
        x: area.position.x,
        y: area.position.y,
        width: area.size.width as i32,
        height: area.size.height as i32,
    })
}

fn layout(window: &Window) -> Result<Layout, String> {
    let pos = window.outer_position().map_err(|e| e.to_string())?;
    let size = window.outer_size().map_err(|e| e.to_string())?;
    Ok(Layout {
        x: pos.x,
        y: pos.y,
        width: size.width,
        height: size.height,
        work_area: work_area(window)?,
    })
}

fn ensure_visible(window: &Window) -> Result<(), String> {
    let current = layout(window)?;
    let area = &current.work_area;
    let visible = current.x + current.width as i32 > area.x + 50
        && current.x < area.x + area.width - 50
        && current.y + current.height as i32 > area.y + 50
        && current.y < area.y + area.height - 50;
    if !visible {
        window
            .set_position(PhysicalPosition::new(
                area.x + area.width - current.width as i32 - 24,
                area.y + area.height - current.height as i32 - 24,
            ))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn startup_enabled() -> bool {
    use winreg::{enums::HKEY_CURRENT_USER, RegKey};
    let key = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey(r"Software\Microsoft\Windows\CurrentVersion\Run");
    let expected = std::env::current_exe()
        .ok()
        .map(|p| format!("\"{}\"", p.display()));
    key.ok()
        .and_then(|k| k.get_value::<String, _>("奶蛙桌宠").ok())
        == expected
}

fn set_startup(enabled: bool) -> Result<(), String> {
    use winreg::{enums::HKEY_CURRENT_USER, RegKey};
    let (key, _) = RegKey::predef(HKEY_CURRENT_USER)
        .create_subkey(r"Software\Microsoft\Windows\CurrentVersion\Run")
        .map_err(|e| e.to_string())?;
    if enabled {
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        key.set_value("奶蛙桌宠", &format!("\"{}\"", exe.display()))
            .map_err(|e| e.to_string())
    } else {
        key.delete_value("奶蛙桌宠")
            .or_else(|e| {
                if e.kind() == std::io::ErrorKind::NotFound {
                    Ok(())
                } else {
                    Err(e)
                }
            })
            .map_err(|e| e.to_string())
    }
}

fn build_menu(app: &AppHandle, tray: bool) -> tauri::Result<Menu<tauri::Wry>> {
    let settings = app.state::<PetState>().settings.lock().unwrap().clone();
    let menu = Menu::new(app)?;
    if tray {
        let hidden = !*app.state::<PetState>().visible.lock().unwrap();
        menu.append(&MenuItem::with_id(
            app,
            "visibility",
            if hidden {
                "显示奶蛙"
            } else {
                "隐藏奶蛙"
            },
            true,
            None::<&str>,
        )?)?;
        menu.append(&PredefinedMenuItem::separator(app)?)?;
    }
    let actions: &[(&str, &str)] = match settings.form.as_str() {
        "niulai" => &[("thumbs-up", "点赞"), ("six-seven", "six seven")],
        "feidudu" => &[("sit", "坐下"), ("sit-peace", "坐下比耶吐舌")],
        _ => &[
            ("laugh", "大笑"),
            ("punch", "拳击"),
            ("wiggle", "扭动"),
            ("peace-overhead", "举手比耶"),
            ("peace-front", "胸前比耶"),
            ("think", "托腮沉思"),
        ],
    };
    for &(id, label) in actions {
        menu.append(&MenuItem::with_id(app, id, label, true, None::<&str>)?)?;
    }
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    let forms = Submenu::new(app, "变身", true)?;
    for (form, label) in [("naiwa", "奶蛙"), ("feidudu", "肥嘟嘟"), ("niulai", "牛来")] {
        forms.append(&CheckMenuItem::with_id(
            app,
            format!("form-{form}"),
            label,
            true,
            settings.form == form,
            None::<&str>,
        )?)?;
    }
    menu.append(&forms)?;
    menu.append(&CheckMenuItem::with_id(
        app,
        "pause",
        "暂停自动动作与移动",
        true,
        settings.paused,
        None::<&str>,
    )?)?;
    let size = Submenu::new(app, "大小", true)?;
    for (value, label, id) in [
        (0.8, "80%", "scale-0.8"),
        (1.0, "100%", "scale-1"),
        (1.2, "120%", "scale-1.2"),
    ] {
        size.append(&CheckMenuItem::with_id(
            app,
            id,
            label,
            true,
            settings.scale == value,
            None::<&str>,
        )?)?;
    }
    menu.append(&size)?;
    menu.append(&CheckMenuItem::with_id(
        app,
        "startup",
        "开机自启动",
        true,
        startup_enabled(),
        None::<&str>,
    )?)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    if !tray {
        menu.append(&MenuItem::with_id(
            app,
            "visibility",
            "隐藏奶蛙",
            true,
            None::<&str>,
        )?)?;
    }
    menu.append(&MenuItem::with_id(
        app,
        "exit",
        "退出奶蛙",
        true,
        None::<&str>,
    )?)?;
    Ok(menu)
}

fn refresh_tray(app: &AppHandle) {
    if let (Some(tray), Ok(menu)) = (app.tray_by_id("main"), build_menu(app, true)) {
        let _ = tray.set_menu(Some(menu));
    }
}

fn show_pet(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_always_on_top(true);
        let _ = window.set_focus();
    }
    *app.state::<PetState>().visible.lock().unwrap() = true;
    refresh_tray(app);
}

fn handle_menu(app: &AppHandle, id: &str) {
    let window = app.get_webview_window("main").unwrap();
    match id {
        "laugh" | "punch" | "wiggle" | "peace-overhead" | "peace-front" | "think" | "sit" | "sit-peace" | "thumbs-up" | "six-seven" => {
            show_pet(app);
            let _ = app.emit("pet-action", id);
        }
        "pause" => {
            let paused = {
                let state = app.state::<PetState>();
                let mut settings = state.settings.lock().unwrap();
                settings.paused = !settings.paused;
                settings.paused
            };
            let _ = save_settings(app);
            let _ = app.emit("pause-changed", paused);
            refresh_tray(app);
        }
        "scale-0.8" | "scale-1" | "scale-1.2" => {
            let scale = id.trim_start_matches("scale-").parse::<f64>().unwrap();
            let _ = set_scale(app.clone(), window, scale);
        }
        "form-naiwa" | "form-feidudu" | "form-niulai" => {
            let form = id.trim_start_matches("form-");
            app.state::<PetState>().settings.lock().unwrap().form = form.into();
            let _ = save_settings(app);
            let _ = app.emit("form-changed", form);
            refresh_tray(app);
        }
        "startup" => {
            if let Err(message) = set_startup(!startup_enabled()) {
                let _ = app.emit("pet-error", message);
            }
            refresh_tray(app);
        }
        "visibility" => {
            if *app.state::<PetState>().visible.lock().unwrap() {
                let _ = window.hide();
                *app.state::<PetState>().visible.lock().unwrap() = false;
                refresh_tray(app);
            } else {
                show_pet(app);
            }
        }
        "exit" => {
            let _ = save_settings(app);
            app.exit(0);
        }
        _ => {}
    }
}

#[tauri::command]
fn initialize(window: Window, app: AppHandle) -> Result<(Settings, Layout), String> {
    let settings = app.state::<PetState>().settings.lock().unwrap().clone();
    window
        .set_size(LogicalSize::new(
            104.0 * settings.scale,
            120.0 * settings.scale,
        ))
        .map_err(|e| e.to_string())?;
    if let (Some(x), Some(y)) = (settings.x, settings.y) {
        window
            .set_position(PhysicalPosition::new(x.round() as i32, y.round() as i32))
            .map_err(|e| e.to_string())?;
    } else {
        let area = work_area(&window)?;
        let size = window.outer_size().map_err(|e| e.to_string())?;
        window
            .set_position(PhysicalPosition::new(
                area.x + area.width - size.width as i32 - 24,
                area.y + area.height - size.height as i32 - 24,
            ))
            .map_err(|e| e.to_string())?;
    }
    ensure_visible(&window)?;
    window.show().map_err(|e| e.to_string())?;
    *app.state::<PetState>().visible.lock().unwrap() = true;
    refresh_tray(&app);
    Ok((settings, layout(&window)?))
}

#[tauri::command]
fn get_layout(window: Window, app: AppHandle) -> Result<Layout, String> {
    let before = window.outer_position().map_err(|e| e.to_string())?;
    ensure_visible(&window)?;
    let updated = layout(&window)?;
    if updated.x != before.x || updated.y != before.y {
        let state = app.state::<PetState>();
        let mut settings = state.settings.lock().unwrap();
        settings.x = Some(updated.x as f64);
        settings.y = Some(updated.y as f64);
        drop(settings);
        save_settings(&app)?;
    }
    Ok(updated)
}

#[tauri::command]
fn move_pet(app: AppHandle, window: Window, x: i32, y: i32) -> Result<(), String> {
    window
        .set_position(PhysicalPosition::new(x, y))
        .map_err(|e| e.to_string())?;
    let state = app.state::<PetState>();
    let mut settings = state.settings.lock().unwrap();
    settings.x = Some(x as f64);
    settings.y = Some(y as f64);
    Ok(())
}

fn cursor_position() -> Result<windows::Win32::Foundation::POINT, String> {
    use windows::Win32::{Foundation::POINT, UI::WindowsAndMessaging::GetCursorPos};
    let mut point = POINT::default();
    unsafe { GetCursorPos(&mut point) }.map_err(|e| e.to_string())?;
    Ok(point)
}

#[tauri::command]
fn begin_drag(app: AppHandle, window: Window) -> Result<(), String> {
    let cursor = cursor_position()?;
    let position = window.outer_position().map_err(|e| e.to_string())?;
    *app.state::<PetState>().drag_offset.lock().unwrap() =
        Some((cursor.x - position.x, cursor.y - position.y));
    Ok(())
}

#[tauri::command]
fn drag_pet(app: AppHandle, window: Window) -> Result<(), String> {
    let Some((offset_x, offset_y)) = *app.state::<PetState>().drag_offset.lock().unwrap() else {
        return Ok(());
    };
    let cursor = cursor_position()?;
    let x = cursor.x - offset_x;
    let y = cursor.y - offset_y;
    window
        .set_position(PhysicalPosition::new(x, y))
        .map_err(|e| e.to_string())?;
    let state = app.state::<PetState>();
    let mut settings = state.settings.lock().unwrap();
    settings.x = Some(x as f64);
    settings.y = Some(y as f64);
    Ok(())
}

#[tauri::command]
fn end_drag(app: AppHandle) -> Result<(), String> {
    *app.state::<PetState>().drag_offset.lock().unwrap() = None;
    save_settings(&app)
}

#[tauri::command]
fn persist_settings(app: AppHandle) -> Result<(), String> {
    save_settings(&app)
}

#[tauri::command]
fn set_scale(app: AppHandle, window: tauri::WebviewWindow, scale: f64) -> Result<Layout, String> {
    if ![0.8, 1.0, 1.2].contains(&scale) {
        return Err("Invalid scale".into());
    }
    window
        .set_size(LogicalSize::new(104.0 * scale, 120.0 * scale))
        .map_err(|e| e.to_string())?;
    let resized = layout(&window.as_ref().window())?;
    let area = &resized.work_area;
    window
        .set_position(PhysicalPosition::new(
            resized.x.clamp(area.x, area.x + (area.width - resized.width as i32).max(0)),
            resized.y.clamp(area.y, area.y + (area.height - resized.height as i32).max(0)),
        ))
        .map_err(|e| e.to_string())?;
    {
        let state = app.state::<PetState>();
        let mut settings = state.settings.lock().unwrap();
        settings.scale = scale;
        let pos = window.outer_position().map_err(|e| e.to_string())?;
        settings.x = Some(pos.x as f64);
        settings.y = Some(pos.y as f64);
    }
    save_settings(&app)?;
    let updated = layout(&window.as_ref().window())?;
    let _ = app.emit("scale-changed", (scale, &updated));
    refresh_tray(&app);
    Ok(updated)
}

#[tauri::command]
fn popup_menu(app: AppHandle, window: tauri::WebviewWindow) -> Result<(), String> {
    build_menu(&app, false)
        .map_err(|e| e.to_string())?
        .popup(window.as_ref().window())
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn desktop_icon_bounds() -> Vec<Rect> {
    tauri::async_runtime::spawn_blocking(read_desktop_icons)
        .await
        .unwrap_or_default()
}

#[cfg(windows)]
fn read_desktop_icons() -> Vec<Rect> {
    use windows::{
        core::{w, BOOL},
        Win32::{
            Foundation::{HWND, LPARAM},
            System::Com::{
                CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER,
                COINIT_MULTITHREADED,
            },
            UI::{
                Accessibility::{
                    CUIAutomation, IUIAutomation, TreeScope_Children, UIA_ListItemControlTypeId,
                },
                WindowsAndMessaging::{EnumWindows, FindWindowExW},
            },
        },
    };

    unsafe extern "system" fn find_list(hwnd: HWND, param: LPARAM) -> BOOL {
        let output = &mut *(param.0 as *mut HWND);
        if let Ok(view) = FindWindowExW(Some(hwnd), None, w!("SHELLDLL_DefView"), None) {
            if let Ok(list) = FindWindowExW(Some(view), None, w!("SysListView32"), None) {
                *output = list;
                return BOOL(0);
            }
        }
        BOOL(1)
    }

    unsafe {
        let mut list = HWND::default();
        let _ = EnumWindows(Some(find_list), LPARAM(&mut list as *mut HWND as isize));
        if list.0.is_null() {
            return Vec::new();
        }
        let initialized = CoInitializeEx(None, COINIT_MULTITHREADED).is_ok();
        let result = (|| {
            let automation: IUIAutomation =
                CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER).ok()?;
            let element = automation.ElementFromHandle(list).ok()?;
            let condition = automation.CreateTrueCondition().ok()?;
            let items = element.FindAll(TreeScope_Children, &condition).ok()?;
            let mut bounds = Vec::new();
            for index in 0..items.Length().ok()? {
                let item = items.GetElement(index).ok()?;
                if item.CurrentControlType().ok()? != UIA_ListItemControlTypeId {
                    continue;
                }
                if let Ok(r) = item.CurrentBoundingRectangle() {
                    if r.right > r.left && r.bottom > r.top {
                        bounds.push(Rect {
                            x: r.left,
                            y: r.top,
                            width: r.right - r.left,
                            height: r.bottom - r.top,
                        });
                    }
                }
            }
            Some(bounds)
        })()
        .unwrap_or_default();
        if initialized {
            CoUninitialize();
        }
        result
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle();
            let path = handle.path().app_config_dir()?.join("settings.json");
            let settings = load_settings(&path);
            handle.manage(PetState {
                settings: Mutex::new(settings),
                path,
                visible: Mutex::new(false),
                drag_offset: Mutex::new(None),
            });
            let menu = build_menu(handle, true)?;
            TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("奶蛙桌宠")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| handle_menu(app, event.id().as_ref()))
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_pet(tray.app_handle());
                    }
                })
                .build(handle)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            initialize,
            get_layout,
            move_pet,
            begin_drag,
            drag_pet,
            end_drag,
            persist_settings,
            set_scale,
            popup_menu,
            desktop_icon_bounds
        ])
        .run(tauri::generate_context!())
        .expect("error while running naiwa pet");
}
