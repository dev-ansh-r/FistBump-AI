mod secrets;

use std::sync::Mutex;
use tauri::{Manager, RunEvent};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};

struct BackendProcess(Mutex<Option<CommandChild>>);

fn spawn_backend(app: &tauri::AppHandle) -> Option<CommandChild> {
    let sidecar = match app.shell().sidecar("rocky-backend") {
        Ok(cmd) => cmd,
        Err(e) => {
            log::error!(
                "Could not resolve rocky-backend sidecar: {e}. \
                 For dev: run `python scripts/build_sidecar.py` once."
            );
            return None;
        }
    };

    match sidecar.args(["--port", "6070"]).spawn() {
        Ok((mut rx, child)) => {
            log::info!("rocky-backend sidecar started (pid {})", child.pid());
            // Drain stdout/stderr so the pipe never blocks and we can surface errors
            tauri::async_runtime::spawn(async move {
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stderr(bytes) => {
                            log::info!("[backend] {}", String::from_utf8_lossy(&bytes).trim_end());
                        }
                        CommandEvent::Stdout(bytes) => {
                            log::info!("[backend] {}", String::from_utf8_lossy(&bytes).trim_end());
                        }
                        CommandEvent::Terminated(payload) => {
                            log::warn!("rocky-backend exited: {:?}", payload);
                            break;
                        }
                        _ => {}
                    }
                }
            });
            Some(child)
        }
        Err(e) => {
            log::error!("Failed to start rocky-backend sidecar: {e}");
            None
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(BackendProcess(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            secrets::save_api_key,
            secrets::get_api_key,
            secrets::delete_api_key,
            secrets::peek_api_key,
            secrets::get_config,
            secrets::set_active_provider,
            secrets::set_active_model,
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            let handle = app.handle().clone();
            let child = spawn_backend(&handle);
            *app.state::<BackendProcess>().0.lock().unwrap() = child;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app, event| {
            if let RunEvent::ExitRequested { .. } = event {
                if let Some(child) = app.state::<BackendProcess>().0.lock().unwrap().take() {
                    let _ = child.kill();
                    log::info!("rocky-backend stopped");
                }
            }
        });
}
