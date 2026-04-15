//! API-key storage (OS keyring) + non-secret config (~/.rocky/config.json).

use std::fs;
use std::path::PathBuf;

use keyring::Entry;
use serde::{Deserialize, Serialize};

const SERVICE: &str = "rocky";

fn config_dir() -> PathBuf {
    let mut p = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    p.push(".rocky");
    let _ = fs::create_dir_all(&p);
    p
}

fn config_path() -> PathBuf {
    let mut p = config_dir();
    p.push("config.json");
    p
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RockyConfig {
    /// Which provider is currently active (e.g. "anthropic").
    pub active_provider: Option<String>,
    /// Per-provider model selection: {"anthropic": "claude-sonnet-4-6", ...}
    #[serde(default)]
    pub active_model: std::collections::HashMap<String, String>,
    /// Providers with a stored key (duplicates what the keyring already knows,
    /// but lets UI render fast without unlocking entries on every render).
    #[serde(default)]
    pub configured: Vec<String>,
}

fn load_config() -> RockyConfig {
    match fs::read_to_string(config_path()) {
        Ok(raw) => serde_json::from_str(&raw).unwrap_or_default(),
        Err(_) => RockyConfig::default(),
    }
}

fn save_config(cfg: &RockyConfig) -> Result<(), String> {
    let raw = serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?;
    fs::write(config_path(), raw).map_err(|e| e.to_string())
}

// ── Tauri commands ──────────────────────────────────────────────────────────

#[tauri::command]
pub fn save_api_key(provider: String, key: String) -> Result<(), String> {
    Entry::new(SERVICE, &provider)
        .map_err(|e| e.to_string())?
        .set_password(&key)
        .map_err(|e| e.to_string())?;

    let mut cfg = load_config();
    if !cfg.configured.contains(&provider) {
        cfg.configured.push(provider.clone());
    }
    if cfg.active_provider.is_none() {
        cfg.active_provider = Some(provider.clone());
    }
    save_config(&cfg)
}

#[tauri::command]
pub fn get_api_key(provider: String) -> Result<String, String> {
    Entry::new(SERVICE, &provider)
        .map_err(|e| e.to_string())?
        .get_password()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_api_key(provider: String) -> Result<(), String> {
    let entry = Entry::new(SERVICE, &provider).map_err(|e| e.to_string())?;
    let _ = entry.delete_credential();

    let mut cfg = load_config();
    cfg.configured.retain(|p| p != &provider);
    cfg.active_model.remove(&provider);
    if cfg.active_provider.as_deref() == Some(provider.as_str()) {
        cfg.active_provider = cfg.configured.first().cloned();
    }
    save_config(&cfg)
}

#[tauri::command]
pub fn get_config() -> RockyConfig {
    load_config()
}

#[tauri::command]
pub fn set_active_provider(provider: String) -> Result<(), String> {
    let mut cfg = load_config();
    cfg.active_provider = Some(provider);
    save_config(&cfg)
}

#[tauri::command]
pub fn set_active_model(provider: String, model: String) -> Result<(), String> {
    let mut cfg = load_config();
    cfg.active_model.insert(provider, model);
    save_config(&cfg)
}

/// Masked key preview for the settings UI: "sk-ant-••••••••Xz3a"
#[tauri::command]
pub fn peek_api_key(provider: String) -> Result<String, String> {
    let key = get_api_key(provider)?;
    let n = key.len();
    if n <= 8 {
        return Ok("••••".into());
    }
    let head: String = key.chars().take(7).collect();
    let tail: String = key.chars().skip(n.saturating_sub(4)).collect();
    Ok(format!("{head}••••••••{tail}"))
}
