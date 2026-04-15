mod secrets;

use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::{Manager, RunEvent};

struct BackendProcess(Mutex<Option<Child>>);

fn spawn_backend() -> Option<Child> {
    // In dev: assumes `rocky-backend` is on PATH (installed via `pip install -e .`).
    // In bundled release: future work — ship a PyInstaller exe as a sidecar binary.
    let mut cmd = Command::new("rocky-backend");
    cmd.arg("--port").arg("6070");
    cmd.stdout(Stdio::null());
    cmd.stderr(Stdio::null());

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    match cmd.spawn() {
        Ok(child) => {
            log::info!("rocky-backend started (pid {})", child.id());
            Some(child)
        }
        Err(e) => {
            log::error!("Failed to start rocky-backend: {e}. Is `pip install -e .` done?");
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
            let child = spawn_backend();
            *app.state::<BackendProcess>().0.lock().unwrap() = child;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app, event| {
            if let RunEvent::ExitRequested { .. } = event {
                if let Some(mut child) = app.state::<BackendProcess>().0.lock().unwrap().take() {
                    let _ = child.kill();
                    log::info!("rocky-backend stopped");
                }
            }
        });
}
