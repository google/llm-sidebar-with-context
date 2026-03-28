/// Installer for LLM Sidebar Chrome extension + native messaging host.
///
/// Supports both CLI and GUI modes:
///   llm-sidebar-installer install   [--extension-id ID]
///   llm-sidebar-installer uninstall [--extension-id ID]
///   llm-sidebar-installer diagnose
///   llm-sidebar-installer gui       (launches the setup wizard)
///
/// Features:
///   - Detects all installed Chromium-based browsers
///   - Registers native messaging host for each detected browser
///   - Installs the CRX via Chrome's external extension mechanism
///   - Diagnoses and validates existing installations
///   - GUI setup wizard (egui) for guided installation
mod browsers;
mod diagnose;

use std::env;
use std::fs;
use std::path::{Path, PathBuf};

pub const HOST_NAME: &str = "com.llm_sidebar.native_host";
pub const DEFAULT_EXTENSION_ID: &str = "hecgmgkofmopdcjlbaegcaanaadhomhb";

fn main() {
    let args: Vec<String> = env::args().collect();

    let command = args.get(1).map(|s| s.as_str()).unwrap_or("gui");
    let extension_id = args
        .iter()
        .position(|a| a == "--extension-id")
        .and_then(|i| args.get(i + 1))
        .map(|s| s.as_str())
        .unwrap_or(DEFAULT_EXTENSION_ID);

    match command {
        "install" => {
            if let Err(e) = install(extension_id) {
                eprintln!("Install failed: {e}");
                std::process::exit(1);
            }
            println!("\nInstallation complete.");
        }
        "uninstall" => {
            if let Err(e) = uninstall() {
                eprintln!("Uninstall failed: {e}");
                std::process::exit(1);
            }
            println!("Uninstall complete.");
        }
        "diagnose" => {
            let report = diagnose::run_diagnostics(extension_id);
            println!("{report}");
        }
        "gui" => {
            #[cfg(feature = "gui")]
            {
                gui::run_wizard();
            }
            #[cfg(not(feature = "gui"))]
            {
                eprintln!("GUI not enabled. Rebuild with --features gui, or use: llm-sidebar-installer install");
                std::process::exit(1);
            }
        }
        _ => {
            eprintln!("Usage: llm-sidebar-installer [install|uninstall|diagnose|gui] [--extension-id ID]");
            std::process::exit(1);
        }
    }
}

#[cfg(feature = "gui")]
mod gui;

// ── Shared helpers ─────────────────────────────────────────────────────

pub fn install_dir() -> PathBuf {
    if cfg!(windows) {
        let local_app = env::var("LOCALAPPDATA").unwrap_or_else(|_| {
            let home = env::var("USERPROFILE").expect("USERPROFILE not set");
            format!("{home}\\AppData\\Local")
        });
        PathBuf::from(local_app).join("LLMSidebar")
    } else {
        let home = env::var("HOME").expect("HOME not set");
        PathBuf::from(home).join(".local/share/llm-sidebar")
    }
}

pub fn host_binary_name() -> &'static str {
    if cfg!(windows) {
        "llm-sidebar-host.exe"
    } else {
        "llm-sidebar-host"
    }
}

pub fn overlay_binary_name() -> &'static str {
    if cfg!(windows) {
        "overlay-companion.exe"
    } else {
        "overlay-companion"
    }
}

/// Find a binary adjacent to the installer, or in a known relative path.
pub fn find_adjacent_binary(name: &str) -> Option<PathBuf> {
    let exe = env::current_exe().ok()?;
    let dir = exe.parent()?;

    let candidate = dir.join(name);
    if candidate.exists() {
        return Some(candidate);
    }
    // Check parent dir (workspace build layout)
    let candidate = dir.join("..").join(name);
    if candidate.exists() {
        return Some(candidate);
    }
    None
}

pub fn find_crx() -> Option<PathBuf> {
    let exe = env::current_exe().ok()?;
    let dir = exe.parent()?;
    for entry in fs::read_dir(dir).ok()? {
        let entry = entry.ok()?;
        let path = entry.path();
        if path.extension().map(|e| e == "crx").unwrap_or(false) {
            return Some(path);
        }
    }
    None
}

// ── Install ────────────────────────────────────────────────────────────

pub fn install(extension_id: &str) -> Result<InstallReport, Box<dyn std::error::Error>> {
    let dest_dir = install_dir();
    fs::create_dir_all(&dest_dir)?;

    let mut report = InstallReport::default();

    // 1. Copy native host binary
    let host_src = find_adjacent_binary(host_binary_name())
        .ok_or("Cannot find llm-sidebar-host binary next to installer")?;
    let host_dest = dest_dir.join(host_binary_name());
    println!("  Copying native host to {}", host_dest.display());
    fs::copy(&host_src, &host_dest)?;
    set_executable(&host_dest);
    report.host_installed = true;

    // 2. Copy overlay companion if present
    if let Some(overlay_src) = find_adjacent_binary(overlay_binary_name()) {
        let overlay_dest = dest_dir.join(overlay_binary_name());
        println!("  Copying overlay companion to {}", overlay_dest.display());
        fs::copy(&overlay_src, &overlay_dest)?;
        set_executable(&overlay_dest);
        report.overlay_installed = true;
    }

    // 3. Detect browsers and register native messaging host for each
    let detected = browsers::detect_browsers();
    if detected.is_empty() {
        println!("  WARNING: No Chromium-based browsers detected.");
    }

    let manifest = serde_json::json!({
        "name": HOST_NAME,
        "description": "Native messaging host for LLM Sidebar Chrome extension",
        "path": host_dest.to_string_lossy(),
        "type": "stdio",
        "allowed_origins": [
            format!("chrome-extension://{extension_id}/")
        ]
    });
    let manifest_json = serde_json::to_string_pretty(&manifest)?;

    for browser in &detected {
        match browsers::register_native_host(browser, &manifest_json) {
            Ok(path) => {
                println!("  Registered native host for {} at {}", browser.name, path.display());
                report.browsers_registered.push(browser.name.clone());
            }
            Err(e) => {
                eprintln!("  WARNING: Failed to register for {}: {e}", browser.name);
                report.browser_errors.push((browser.name.clone(), e.to_string()));
            }
        }
    }

    // 4. Install CRX if present
    if let Some(crx_path) = find_crx() {
        install_crx(&crx_path, extension_id, &dest_dir)?;
        report.crx_installed = true;
    } else {
        println!("  No .crx found next to installer, skipping CRX install.");
    }

    Ok(report)
}

pub fn uninstall() -> Result<(), Box<dyn std::error::Error>> {
    let dest_dir = install_dir();

    // Unregister from all detected browsers
    let detected = browsers::detect_browsers();
    for browser in &detected {
        if let Err(e) = browsers::unregister_native_host(browser) {
            eprintln!("  WARNING: Failed to unregister from {}: {e}", browser.name);
        } else {
            println!("  Unregistered from {}", browser.name);
        }
    }

    if dest_dir.exists() {
        println!("  Removing {}", dest_dir.display());
        fs::remove_dir_all(&dest_dir)?;
    }

    Ok(())
}

#[derive(Default, Debug, Clone)]
pub struct InstallReport {
    pub host_installed: bool,
    pub overlay_installed: bool,
    pub crx_installed: bool,
    pub browsers_registered: Vec<String>,
    pub browser_errors: Vec<(String, String)>,
}

fn set_executable(_path: &Path) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(_path, fs::Permissions::from_mode(0o755));
    }
}

// ── CRX installation (external extension mechanism) ────────────────────

#[cfg(unix)]
fn install_crx(crx_path: &Path, extension_id: &str, dest_dir: &Path) -> Result<(), Box<dyn std::error::Error>> {
    let crx_dest = dest_dir.join("llm-sidebar.crx");
    fs::copy(crx_path, &crx_dest)?;

    // Use the first detected browser's external extension dir
    let ext_dir = if cfg!(target_os = "macos") {
        let home = env::var("HOME")?;
        PathBuf::from(home).join("Library/Application Support/Google/Chrome/External Extensions")
    } else {
        let home = env::var("HOME")?;
        PathBuf::from(home).join(".config/google-chrome/External Extensions")
    };
    fs::create_dir_all(&ext_dir)?;

    let ext_json = serde_json::json!({
        "external_crx": crx_dest.to_string_lossy(),
        "external_version": "1.0"
    });
    let ext_path = ext_dir.join(format!("{extension_id}.json"));
    println!("  Registering external extension at {}", ext_path.display());
    fs::write(&ext_path, serde_json::to_string_pretty(&ext_json)?)?;
    Ok(())
}

#[cfg(windows)]
fn install_crx(crx_path: &Path, extension_id: &str, dest_dir: &Path) -> Result<(), Box<dyn std::error::Error>> {
    let crx_dest = dest_dir.join("llm-sidebar.crx");
    fs::copy(crx_path, &crx_dest)?;

    use winreg::enums::*;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let path = format!("Software\\Google\\Chrome\\Extensions\\{extension_id}");
    let (key, _) = hkcu.create_subkey(&path)?;
    key.set_value("path", &crx_dest.to_string_lossy().to_string())?;
    key.set_value("version", &"1.0")?;
    println!("  Registered external extension in HKCU\\{path}");
    Ok(())
}
