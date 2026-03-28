/// Multi-browser detection and native messaging host registration.
///
/// Detects Chrome, Chromium, Brave, Edge, Vivaldi, and Chrome for Testing.
/// Registers the native messaging host manifest in the correct location for each.
use std::fs;
use std::path::PathBuf;

use crate::HOST_NAME;

#[derive(Debug, Clone)]
pub struct Browser {
    pub name: String,
    pub variant: BrowserVariant,
    pub native_messaging_dir: PathBuf,
    #[cfg(windows)]
    pub registry_key: String,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum BrowserVariant {
    Chrome,
    Chromium,
    Brave,
    Edge,
    Vivaldi,
    ChromeForTesting,
}

impl std::fmt::Display for BrowserVariant {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Chrome => write!(f, "Google Chrome"),
            Self::Chromium => write!(f, "Chromium"),
            Self::Brave => write!(f, "Brave"),
            Self::Edge => write!(f, "Microsoft Edge"),
            Self::Vivaldi => write!(f, "Vivaldi"),
            Self::ChromeForTesting => write!(f, "Chrome for Testing"),
        }
    }
}

/// Detect all installed Chromium-based browsers on this system.
pub fn detect_browsers() -> Vec<Browser> {
    let mut found = Vec::new();

    for candidate in browser_candidates() {
        if candidate.native_messaging_dir.parent().map(|p| p.exists()).unwrap_or(false)
            || is_browser_installed(&candidate)
        {
            found.push(candidate);
        }
    }

    found
}

/// Register the native messaging host manifest for a specific browser.
pub fn register_native_host(
    browser: &Browser,
    manifest_json: &str,
) -> Result<PathBuf, Box<dyn std::error::Error>> {
    fs::create_dir_all(&browser.native_messaging_dir)?;
    let manifest_path = browser.native_messaging_dir.join(format!("{HOST_NAME}.json"));
    fs::write(&manifest_path, manifest_json)?;

    #[cfg(windows)]
    {
        register_windows_registry(browser, &manifest_path)?;
    }

    Ok(manifest_path)
}

/// Remove the native messaging host manifest for a specific browser.
pub fn unregister_native_host(browser: &Browser) -> Result<(), Box<dyn std::error::Error>> {
    let manifest_path = browser.native_messaging_dir.join(format!("{HOST_NAME}.json"));
    if manifest_path.exists() {
        fs::remove_file(&manifest_path)?;
    }

    #[cfg(windows)]
    {
        unregister_windows_registry(browser)?;
    }

    Ok(())
}

// ── Platform: Linux ────────────────────────────────────────────────────

#[cfg(target_os = "linux")]
fn browser_candidates() -> Vec<Browser> {
    let home = std::env::var("HOME").unwrap_or_default();
    let config = format!("{home}/.config");

    vec![
        Browser {
            name: "Google Chrome".into(),
            variant: BrowserVariant::Chrome,
            native_messaging_dir: PathBuf::from(&config).join("google-chrome/NativeMessagingHosts"),
        },
        Browser {
            name: "Chromium".into(),
            variant: BrowserVariant::Chromium,
            native_messaging_dir: PathBuf::from(&config).join("chromium/NativeMessagingHosts"),
        },
        Browser {
            name: "Brave".into(),
            variant: BrowserVariant::Brave,
            native_messaging_dir: PathBuf::from(&config).join("BraveSoftware/Brave-Browser/NativeMessagingHosts"),
        },
        Browser {
            name: "Microsoft Edge".into(),
            variant: BrowserVariant::Edge,
            native_messaging_dir: PathBuf::from(&config).join("microsoft-edge/NativeMessagingHosts"),
        },
        Browser {
            name: "Vivaldi".into(),
            variant: BrowserVariant::Vivaldi,
            native_messaging_dir: PathBuf::from(&config).join("vivaldi/NativeMessagingHosts"),
        },
        Browser {
            name: "Chrome for Testing".into(),
            variant: BrowserVariant::ChromeForTesting,
            native_messaging_dir: PathBuf::from(&config)
                .join("google-chrome-for-testing/NativeMessagingHosts"),
        },
    ]
}

#[cfg(target_os = "linux")]
fn is_browser_installed(candidate: &Browser) -> bool {
    // Check if the browser's config directory parent exists
    candidate
        .native_messaging_dir
        .parent()
        .map(|p| p.exists())
        .unwrap_or(false)
}

// ── Platform: macOS ────────────────────────────────────────────────────

#[cfg(target_os = "macos")]
fn browser_candidates() -> Vec<Browser> {
    let home = std::env::var("HOME").unwrap_or_default();
    let app_support = format!("{home}/Library/Application Support");

    vec![
        Browser {
            name: "Google Chrome".into(),
            variant: BrowserVariant::Chrome,
            native_messaging_dir: PathBuf::from(&app_support)
                .join("Google/Chrome/NativeMessagingHosts"),
        },
        Browser {
            name: "Chromium".into(),
            variant: BrowserVariant::Chromium,
            native_messaging_dir: PathBuf::from(&app_support)
                .join("Chromium/NativeMessagingHosts"),
        },
        Browser {
            name: "Brave".into(),
            variant: BrowserVariant::Brave,
            native_messaging_dir: PathBuf::from(&app_support)
                .join("BraveSoftware/Brave-Browser/NativeMessagingHosts"),
        },
        Browser {
            name: "Microsoft Edge".into(),
            variant: BrowserVariant::Edge,
            native_messaging_dir: PathBuf::from(&app_support)
                .join("Microsoft Edge/NativeMessagingHosts"),
        },
        Browser {
            name: "Vivaldi".into(),
            variant: BrowserVariant::Vivaldi,
            native_messaging_dir: PathBuf::from(&app_support)
                .join("Vivaldi/NativeMessagingHosts"),
        },
    ]
}

#[cfg(target_os = "macos")]
fn is_browser_installed(candidate: &Browser) -> bool {
    // Check if the browser app exists
    let app_name = match candidate.variant {
        BrowserVariant::Chrome => "Google Chrome.app",
        BrowserVariant::Chromium => "Chromium.app",
        BrowserVariant::Brave => "Brave Browser.app",
        BrowserVariant::Edge => "Microsoft Edge.app",
        BrowserVariant::Vivaldi => "Vivaldi.app",
        BrowserVariant::ChromeForTesting => return false,
    };
    PathBuf::from("/Applications").join(app_name).exists()
}

// ── Platform: Windows ──────────────────────────────────────────────────

#[cfg(windows)]
fn browser_candidates() -> Vec<Browser> {
    let local_app = std::env::var("LOCALAPPDATA").unwrap_or_default();

    vec![
        Browser {
            name: "Google Chrome".into(),
            variant: BrowserVariant::Chrome,
            native_messaging_dir: crate::install_dir(),
            registry_key: format!(
                "Software\\Google\\Chrome\\NativeMessagingHosts\\{HOST_NAME}"
            ),
        },
        Browser {
            name: "Brave".into(),
            variant: BrowserVariant::Brave,
            native_messaging_dir: crate::install_dir(),
            registry_key: format!(
                "Software\\BraveSoftware\\Brave-Browser\\NativeMessagingHosts\\{HOST_NAME}"
            ),
        },
        Browser {
            name: "Microsoft Edge".into(),
            variant: BrowserVariant::Edge,
            native_messaging_dir: crate::install_dir(),
            registry_key: format!(
                "Software\\Microsoft\\Edge\\NativeMessagingHosts\\{HOST_NAME}"
            ),
        },
        Browser {
            name: "Vivaldi".into(),
            variant: BrowserVariant::Vivaldi,
            native_messaging_dir: crate::install_dir(),
            registry_key: format!(
                "Software\\Vivaldi\\NativeMessagingHosts\\{HOST_NAME}"
            ),
        },
    ]
}

#[cfg(windows)]
fn is_browser_installed(candidate: &Browser) -> bool {
    let local_app = std::env::var("LOCALAPPDATA").unwrap_or_default();
    let path = match candidate.variant {
        BrowserVariant::Chrome => format!("{local_app}\\Google\\Chrome\\Application\\chrome.exe"),
        BrowserVariant::Brave => format!(
            "{local_app}\\BraveSoftware\\Brave-Browser\\Application\\brave.exe"
        ),
        BrowserVariant::Edge => {
            // Edge is typically in Program Files
            let pf = std::env::var("PROGRAMFILES").unwrap_or_default();
            format!("{pf}\\Microsoft\\Edge\\Application\\msedge.exe")
        }
        BrowserVariant::Vivaldi => format!("{local_app}\\Vivaldi\\Application\\vivaldi.exe"),
        _ => return false,
    };
    PathBuf::from(path).exists()
}

#[cfg(windows)]
fn register_windows_registry(
    browser: &Browser,
    manifest_path: &std::path::Path,
) -> Result<(), Box<dyn std::error::Error>> {
    use winreg::enums::*;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let (key, _) = hkcu.create_subkey(&browser.registry_key)?;
    key.set_value("", &manifest_path.to_string_lossy().to_string())?;
    Ok(())
}

#[cfg(windows)]
fn unregister_windows_registry(browser: &Browser) -> Result<(), Box<dyn std::error::Error>> {
    use winreg::enums::*;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let _ = hkcu.delete_subkey_all(&browser.registry_key);
    Ok(())
}
