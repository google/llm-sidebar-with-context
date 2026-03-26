/// Installer for LLM Sidebar Chrome extension + native messaging host.
///
/// Usage:
///   llm-sidebar-installer install   [--extension-id ID]
///   llm-sidebar-installer uninstall [--extension-id ID]
///
/// What it does:
///   1. Copies the native host binary to a platform-specific location
///   2. Writes the native messaging host manifest JSON
///   3. Registers the host with Chrome (registry on Windows, manifest file on Linux/macOS)
///   4. Installs the CRX via Chrome's external extension mechanism (if .crx is adjacent)
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

const HOST_NAME: &str = "com.llm_sidebar.native_host";
const DEFAULT_EXTENSION_ID: &str = "hecgmgkofmopdcjlbaegcaanaadhomhb";

fn main() {
    let args: Vec<String> = env::args().collect();

    let command = args.get(1).map(|s| s.as_str()).unwrap_or("install");
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
            println!("Installation complete.");
        }
        "uninstall" => {
            if let Err(e) = uninstall() {
                eprintln!("Uninstall failed: {e}");
                std::process::exit(1);
            }
            println!("Uninstall complete.");
        }
        _ => {
            eprintln!("Usage: llm-sidebar-installer [install|uninstall] [--extension-id ID]");
            std::process::exit(1);
        }
    }
}

fn install_dir() -> PathBuf {
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

fn host_binary_name() -> &'static str {
    if cfg!(windows) {
        "llm-sidebar-host.exe"
    } else {
        "llm-sidebar-host"
    }
}

/// Find the host binary adjacent to the installer, or in a known relative path.
fn find_host_binary() -> Option<PathBuf> {
    let exe = env::current_exe().ok()?;
    let dir = exe.parent()?;
    let name = host_binary_name();

    // Check same directory
    let candidate = dir.join(name);
    if candidate.exists() {
        return Some(candidate);
    }
    // Check ../host/ (workspace build layout)
    let candidate = dir.join("../host").join(name);
    if candidate.exists() {
        return Some(candidate);
    }
    None
}

fn find_crx() -> Option<PathBuf> {
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

fn install(extension_id: &str) -> Result<(), Box<dyn std::error::Error>> {
    let dest_dir = install_dir();
    fs::create_dir_all(&dest_dir)?;

    // 1. Copy the native host binary
    let host_src = find_host_binary().ok_or("Cannot find llm-sidebar-host binary next to installer")?;
    let host_dest = dest_dir.join(host_binary_name());
    println!("Copying native host to {}", host_dest.display());
    fs::copy(&host_src, &host_dest)?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&host_dest, fs::Permissions::from_mode(0o755))?;
    }

    // 2. Write native messaging host manifest
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

    // 3. Register with Chrome
    register_native_host(&manifest_json, &dest_dir)?;

    // 4. Install CRX if present (external extension mechanism)
    if let Some(crx_path) = find_crx() {
        install_crx(&crx_path, extension_id, &dest_dir)?;
    } else {
        println!("No .crx found next to installer, skipping CRX install.");
    }

    Ok(())
}

fn uninstall() -> Result<(), Box<dyn std::error::Error>> {
    let dest_dir = install_dir();

    unregister_native_host()?;

    if dest_dir.exists() {
        println!("Removing {}", dest_dir.display());
        fs::remove_dir_all(&dest_dir)?;
    }

    Ok(())
}

// ── Platform: Linux / macOS ────────────────────────────────────────────

#[cfg(unix)]
fn native_host_manifest_dir() -> PathBuf {
    if cfg!(target_os = "macos") {
        let home = env::var("HOME").expect("HOME not set");
        PathBuf::from(home).join("Library/Application Support/Google/Chrome/NativeMessagingHosts")
    } else {
        let home = env::var("HOME").expect("HOME not set");
        PathBuf::from(home).join(".config/google-chrome/NativeMessagingHosts")
    }
}

#[cfg(unix)]
fn register_native_host(manifest_json: &str, _dest_dir: &Path) -> Result<(), Box<dyn std::error::Error>> {
    let dir = native_host_manifest_dir();
    fs::create_dir_all(&dir)?;
    let manifest_path = dir.join(format!("{HOST_NAME}.json"));
    println!("Writing native host manifest to {}", manifest_path.display());
    fs::write(&manifest_path, manifest_json)?;
    Ok(())
}

#[cfg(unix)]
fn unregister_native_host() -> Result<(), Box<dyn std::error::Error>> {
    let manifest_path = native_host_manifest_dir().join(format!("{HOST_NAME}.json"));
    if manifest_path.exists() {
        println!("Removing {}", manifest_path.display());
        fs::remove_file(&manifest_path)?;
    }
    Ok(())
}

#[cfg(unix)]
fn install_crx(crx_path: &Path, extension_id: &str, dest_dir: &Path) -> Result<(), Box<dyn std::error::Error>> {
    // Copy CRX to install dir
    let crx_dest = dest_dir.join("llm-sidebar.crx");
    fs::copy(crx_path, &crx_dest)?;

    // Chrome external extensions: /usr/share/google-chrome/extensions/{id}.json
    // or ~/.config/google-chrome/External Extensions/{id}.json (user-level)
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
    println!("Registering external extension at {}", ext_path.display());
    fs::write(&ext_path, serde_json::to_string_pretty(&ext_json)?)?;
    Ok(())
}

// ── Platform: Windows ──────────────────────────────────────────────────

#[cfg(windows)]
fn register_native_host(manifest_json: &str, dest_dir: &Path) -> Result<(), Box<dyn std::error::Error>> {
    // Write manifest file
    let manifest_path = dest_dir.join(format!("{HOST_NAME}.json"));
    println!("Writing native host manifest to {}", manifest_path.display());
    fs::write(&manifest_path, manifest_json)?;

    // Register in Windows registry
    use winreg::enums::*;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let path = format!("Software\\Google\\Chrome\\NativeMessagingHosts\\{HOST_NAME}");
    let (key, _) = hkcu.create_subkey(&path)?;
    key.set_value("", &manifest_path.to_string_lossy().to_string())?;
    println!("Registered native host in HKCU\\{path}");
    Ok(())
}

#[cfg(windows)]
fn unregister_native_host() -> Result<(), Box<dyn std::error::Error>> {
    use winreg::enums::*;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let path = format!("Software\\Google\\Chrome\\NativeMessagingHosts\\{HOST_NAME}");
    let _ = hkcu.delete_subkey_all(&path); // ignore if not exists
    println!("Removed registry key HKCU\\{path}");
    Ok(())
}

#[cfg(windows)]
fn install_crx(crx_path: &Path, extension_id: &str, dest_dir: &Path) -> Result<(), Box<dyn std::error::Error>> {
    let crx_dest = dest_dir.join("llm-sidebar.crx");
    fs::copy(crx_path, &crx_dest)?;

    // Register via Windows registry for external extensions
    use winreg::enums::*;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let path = format!("Software\\Google\\Chrome\\Extensions\\{extension_id}");
    let (key, _) = hkcu.create_subkey(&path)?;
    key.set_value("path", &crx_dest.to_string_lossy().to_string())?;
    key.set_value("version", &"1.0")?;
    println!("Registered external extension in HKCU\\{path}");
    Ok(())
}
