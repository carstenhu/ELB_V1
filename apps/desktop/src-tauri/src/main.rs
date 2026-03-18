#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::process::Command;
use tauri::{AppHandle, Manager};

fn resolve_data_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let base_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|error| format!("App-Datenpfad konnte nicht ermittelt werden: {error}"))?;
    Ok(base_dir.join("Daten"))
}

#[tauri::command]
fn get_data_directory_path(app: AppHandle) -> Result<String, String> {
    Ok(resolve_data_dir(&app)?
        .to_string_lossy()
        .into_owned())
}

#[tauri::command]
fn open_data_directory(app: AppHandle) -> Result<String, String> {
    let data_dir = resolve_data_dir(&app)?;
    fs::create_dir_all(&data_dir)
        .map_err(|error| format!("Datenordner konnte nicht angelegt werden: {error}"))?;

    Command::new("explorer")
        .arg(&data_dir)
        .spawn()
        .map_err(|error| format!("Datenordner konnte nicht geöffnet werden: {error}"))?;

    Ok(data_dir.to_string_lossy().into_owned())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            get_data_directory_path,
            open_data_directory
        ])
        .run(tauri::generate_context!())
        .expect("Fehler beim Starten von ELB V1");
}
