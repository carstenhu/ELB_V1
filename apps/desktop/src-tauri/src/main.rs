#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::process::Command;
use tauri::{AppHandle, Manager};

const DATA_DIR_NAME: &str = "ELB_V1_Daten";

fn resolve_data_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let base_dir = app
        .path()
        .download_dir()
        .map_err(|error| format!("Download-Datenpfad konnte nicht ermittelt werden: {error}"))?;
    Ok(base_dir.join(DATA_DIR_NAME))
}

#[tauri::command]
fn get_data_directory_path(app: AppHandle) -> Result<String, String> {
    Ok(resolve_data_dir(&app)?
        .to_string_lossy()
        .into_owned())
}

#[tauri::command]
fn open_app_local_data_path(app: AppHandle, relative_path: String) -> Result<String, String> {
    let target_path = resolve_data_dir(&app)?.join(&relative_path);

    if !target_path.exists() {
        return Err(format!(
            "Datei konnte nicht geoeffnet werden, weil sie nicht existiert: {}",
            target_path.to_string_lossy()
        ));
    }

    Command::new("cmd")
        .args(["/C", "start", ""])
        .arg(&target_path)
        .spawn()
        .map_err(|error| format!("Datei konnte nicht geoeffnet werden: {error}"))?;

    Ok(target_path.to_string_lossy().into_owned())
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
            open_app_local_data_path,
            open_data_directory
        ])
        .run(tauri::generate_context!())
        .expect("Fehler beim Starten von ELB V1");
}
