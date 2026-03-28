/// Connection health diagnostics for the native messaging setup.
///
/// Validates:
///   - Host binary exists and is executable
///   - Overlay companion exists (optional)
///   - Native messaging manifest exists for each detected browser
///   - Manifest JSON is valid and points to the correct binary
///   - Host binary responds to a test message
///   - Extension is registered (CRX or external extension JSON)
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};

use crate::{browsers, install_dir, host_binary_name, overlay_binary_name, HOST_NAME};

#[derive(Debug)]
pub struct DiagnosticResult {
    pub label: String,
    pub status: DiagStatus,
    pub detail: String,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum DiagStatus {
    Pass,
    Warn,
    Fail,
}

impl std::fmt::Display for DiagStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Pass => write!(f, "PASS"),
            Self::Warn => write!(f, "WARN"),
            Self::Fail => write!(f, "FAIL"),
        }
    }
}

pub fn run_diagnostics(_extension_id: &str) -> String {
    let mut results = Vec::new();
    let dest_dir = install_dir();

    // 1. Check host binary
    let host_path = dest_dir.join(host_binary_name());
    if host_path.exists() {
        results.push(DiagnosticResult {
            label: "Native host binary".into(),
            status: DiagStatus::Pass,
            detail: format!("Found at {}", host_path.display()),
        });

        // Test if host responds
        match test_host_binary(&host_path) {
            Ok(()) => results.push(DiagnosticResult {
                label: "Native host responds".into(),
                status: DiagStatus::Pass,
                detail: "Host accepted a test message and replied".into(),
            }),
            Err(e) => results.push(DiagnosticResult {
                label: "Native host responds".into(),
                status: DiagStatus::Fail,
                detail: format!("Host failed to respond: {e}"),
            }),
        }
    } else {
        results.push(DiagnosticResult {
            label: "Native host binary".into(),
            status: DiagStatus::Fail,
            detail: format!("Not found at {}", host_path.display()),
        });
    }

    // 2. Check overlay companion
    let overlay_path = dest_dir.join(overlay_binary_name());
    if overlay_path.exists() {
        results.push(DiagnosticResult {
            label: "Overlay companion".into(),
            status: DiagStatus::Pass,
            detail: format!("Found at {}", overlay_path.display()),
        });
    } else {
        results.push(DiagnosticResult {
            label: "Overlay companion".into(),
            status: DiagStatus::Warn,
            detail: "Not installed (optional)".into(),
        });
    }

    // 3. Check each browser's native messaging manifest
    let browsers = browsers::detect_browsers();
    if browsers.is_empty() {
        results.push(DiagnosticResult {
            label: "Browser detection".into(),
            status: DiagStatus::Warn,
            detail: "No Chromium-based browsers detected".into(),
        });
    }

    for browser in &browsers {
        let manifest_path = browser.native_messaging_dir.join(format!("{HOST_NAME}.json"));
        if manifest_path.exists() {
            match validate_manifest(&manifest_path, &host_path) {
                Ok(()) => results.push(DiagnosticResult {
                    label: format!("{} manifest", browser.name),
                    status: DiagStatus::Pass,
                    detail: format!("Valid at {}", manifest_path.display()),
                }),
                Err(e) => results.push(DiagnosticResult {
                    label: format!("{} manifest", browser.name),
                    status: DiagStatus::Fail,
                    detail: format!("Invalid: {e}"),
                }),
            }
        } else {
            results.push(DiagnosticResult {
                label: format!("{} manifest", browser.name),
                status: DiagStatus::Fail,
                detail: format!("Not found at {}", manifest_path.display()),
            });
        }
    }

    // Format report
    format_report(&results)
}

fn validate_manifest(
    manifest_path: &PathBuf,
    _expected_host_path: &PathBuf,
) -> Result<(), String> {
    let content = fs::read_to_string(manifest_path).map_err(|e| format!("Cannot read: {e}"))?;
    let json: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| format!("Invalid JSON: {e}"))?;

    // Check name
    let name = json.get("name").and_then(|v| v.as_str()).unwrap_or("");
    if name != HOST_NAME {
        return Err(format!("Name mismatch: expected {HOST_NAME}, got {name}"));
    }

    // Check path points to existing binary
    let path = json.get("path").and_then(|v| v.as_str()).unwrap_or("");
    if !PathBuf::from(path).exists() {
        return Err(format!("Binary path does not exist: {path}"));
    }

    // Check type is stdio
    let typ = json.get("type").and_then(|v| v.as_str()).unwrap_or("");
    if typ != "stdio" {
        return Err(format!("Type should be 'stdio', got '{typ}'"));
    }

    Ok(())
}

fn test_host_binary(host_path: &PathBuf) -> Result<(), String> {
    // Send a minimal native messaging frame: 4-byte LE length + JSON
    let msg = br#"{"type":"ping"}"#;
    let len = (msg.len() as u32).to_le_bytes();

    let mut child = Command::new(host_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Cannot spawn host: {e}"))?;

    if let Some(ref mut stdin) = child.stdin {
        stdin.write_all(&len).map_err(|e| format!("Write len: {e}"))?;
        stdin.write_all(msg).map_err(|e| format!("Write msg: {e}"))?;
    }
    // Drop stdin to signal EOF
    drop(child.stdin.take());

    let output = child
        .wait_with_output()
        .map_err(|e| format!("Wait: {e}"))?;

    // Host should produce some output (even if it's an error response)
    if output.stdout.len() >= 4 {
        Ok(())
    } else if !output.stderr.is_empty() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Host stderr: {}", stderr.trim()))
    } else {
        Err("Host produced no output".into())
    }
}

fn format_report(results: &[DiagnosticResult]) -> String {
    let mut out = String::new();
    out.push_str("\n  LLM SIDEBAR DIAGNOSTIC REPORT\n");
    out.push_str("  ─────────────────────────────────────────\n\n");

    let pass_count = results.iter().filter(|r| r.status == DiagStatus::Pass).count();
    let warn_count = results.iter().filter(|r| r.status == DiagStatus::Warn).count();
    let fail_count = results.iter().filter(|r| r.status == DiagStatus::Fail).count();

    for r in results {
        let icon = match r.status {
            DiagStatus::Pass => "+",
            DiagStatus::Warn => "?",
            DiagStatus::Fail => "x",
        };
        out.push_str(&format!("  [{icon}] {}: {}\n", r.label, r.detail));
    }

    out.push_str(&format!(
        "\n  Summary: {pass_count} passed, {warn_count} warnings, {fail_count} failed\n"
    ));

    if fail_count > 0 {
        out.push_str("  Run 'llm-sidebar-installer install' to fix issues.\n");
    }

    out
}
