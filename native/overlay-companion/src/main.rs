use anyhow::{anyhow, Context, Result};
use dirs::config_dir;
use interprocess::{
    local_socket::{prelude::*, GenericFilePath, GenericNamespaced, ListenerOptions, Name, Stream},
    TryClone,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::env;
use std::fs;
use std::io::{self, BufRead, BufReader, BufWriter, Read, Write};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const HOST_NAME: &str = "com.maceip.native_overlay_companion";
const APP_LABEL: &str = "overlay-companion";
const DEFAULT_HEARTBEAT_MS: u64 = 22_000;
const WINDOWS_TASK_NAME: &str = "Mace Overlay Companion";
const MACOS_LAUNCH_AGENT_LABEL: &str = "com.maceip.native-overlay-companion";

#[derive(Debug, Clone, Serialize, Deserialize)]
struct RpcRequest {
    jsonrpc: String,
    id: Option<String>,
    method: String,
    #[serde(default)]
    params: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct RpcError {
    code: i64,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct RpcSuccess {
    jsonrpc: &'static str,
    id: String,
    result: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct RpcFailure {
    jsonrpc: &'static str,
    id: Option<String>,
    error: RpcError,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct HelloParams {
    #[serde(rename = "extensionSessionId")]
    extension_session_id: String,
    #[serde(rename = "extensionVersion")]
    extension_version: String,
    browser: String,
    capabilities: Vec<String>,
    #[serde(default)]
    platform: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PingParams {
    #[serde(rename = "extensionSessionId")]
    extension_session_id: String,
    #[serde(rename = "sentAt")]
    sent_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct DaemonState {
    native_session_id: String,
    restart_count: u64,
    overlay_status: String,
    service_status: String,
    platform: String,
    supported_features: Vec<String>,
    last_extension_session_id: Option<String>,
    last_ping_at: Option<u64>,
    heartbeat_interval_ms: u64,
}

impl Default for DaemonState {
    fn default() -> Self {
        Self {
            native_session_id: session_id(),
            restart_count: 0,
            overlay_status: overlay_status(),
            service_status: "ready".to_string(),
            platform: platform_name(),
            supported_features: supported_features(),
            last_extension_session_id: None,
            last_ping_at: None,
            heartbeat_interval_ms: DEFAULT_HEARTBEAT_MS,
        }
    }
}

#[derive(Debug, Clone)]
struct AppPaths {
    runtime_dir: PathBuf,
    daemon_state_path: PathBuf,
    native_host_manifest_paths: Vec<PathBuf>,
    windows_task_path: PathBuf,
    macos_launch_agent_path: PathBuf,
}

impl AppPaths {
    fn discover() -> Result<Self> {
        let cfg_root = config_dir()
            .or_else(|| env::var_os("XDG_CONFIG_HOME").map(PathBuf::from))
            .unwrap_or_else(|| PathBuf::from("."));
        let runtime_dir = cfg_root.join(APP_LABEL);
        fs::create_dir_all(&runtime_dir)
            .with_context(|| format!("creating runtime dir {}", runtime_dir.display()))?;

        let host_roots = [
            cfg_root.join("google-chrome-for-testing").join("NativeMessagingHosts"),
            cfg_root.join("google-chrome").join("NativeMessagingHosts"),
            cfg_root.join("chromium").join("NativeMessagingHosts"),
        ];

        let mut native_host_manifest_paths = Vec::new();
        for host_root in host_roots {
            fs::create_dir_all(&host_root)
                .with_context(|| format!("creating host dir {}", host_root.display()))?;
            native_host_manifest_paths.push(host_root.join(format!("{}.json", HOST_NAME)));
        }

        Ok(Self {
            runtime_dir: runtime_dir.clone(),
            daemon_state_path: runtime_dir.join("daemon-state.json"),
            native_host_manifest_paths,
            windows_task_path: runtime_dir.join("windows-task.xml"),
            macos_launch_agent_path: runtime_dir
                .join(format!("{}.plist", MACOS_LAUNCH_AGENT_LABEL)),
        })
    }
}

fn platform_name() -> String {
    match env::consts::OS {
        "macos" => "macos".to_string(),
        "windows" => "windows".to_string(),
        other => other.to_string(),
    }
}

fn overlay_status() -> String {
    match env::consts::OS {
        "macos" | "windows" => "running".to_string(),
        _ => "unsupported".to_string(),
    }
}

fn supported_features() -> Vec<String> {
    let mut base = vec![
        "native-messaging".to_string(),
        "json-rpc".to_string(),
        "ipc".to_string(),
        "self-bootstrap".to_string(),
        "boot-assets".to_string(),
    ];
    if matches!(env::consts::OS, "macos" | "windows") {
        base.push("overlay".to_string());
        base.push("always-on-top".to_string());
        base.push("click-through".to_string());
    }
    base
}

fn session_id() -> String {
    format!("native-{}", now_ms())
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_else(|_| Duration::from_millis(0))
        .as_millis() as u64
}

fn load_state(paths: &AppPaths) -> Result<DaemonState> {
    if !paths.daemon_state_path.exists() {
        return Ok(DaemonState::default());
    }

    let text = fs::read_to_string(&paths.daemon_state_path)
        .with_context(|| format!("reading {}", paths.daemon_state_path.display()))?;
    let mut state: DaemonState = serde_json::from_str(&text)
        .with_context(|| format!("parsing {}", paths.daemon_state_path.display()))?;
    state.overlay_status = overlay_status();
    state.service_status = "ready".to_string();
    state.platform = platform_name();
    state.supported_features = supported_features();
    Ok(state)
}

fn save_state(paths: &AppPaths, state: &DaemonState) -> Result<()> {
    fs::create_dir_all(&paths.runtime_dir)?;
    let json = serde_json::to_string_pretty(state)?;
    fs::write(&paths.daemon_state_path, json)
        .with_context(|| format!("writing {}", paths.daemon_state_path.display()))?;
    Ok(())
}

fn daemon_socket_name(paths: &AppPaths) -> Result<Name<'static>> {
    if GenericNamespaced::is_supported() {
        format!("{}.daemon", HOST_NAME)
            .to_ns_name::<GenericNamespaced>()
            .map(Name::into_owned)
            .context("creating namespaced local socket name")
    } else {
        paths.runtime_dir
            .join("daemon.sock")
            .to_fs_name::<GenericFilePath>()
            .map(Name::into_owned)
            .context("creating filesystem local socket name")
    }
}

fn ensure_assets(paths: &AppPaths, extension_id: &str) -> Result<()> {
    fs::create_dir_all(&paths.runtime_dir)?;

    let exe_path = env::current_exe().context("resolving current executable")?;
    let manifest = json!({
        "name": HOST_NAME,
        "description": "Native overlay companion for the Chrome extension",
        "path": exe_path,
        "type": "stdio",
        "allowed_origins": [format!("chrome-extension://{}/", extension_id)],
    });
    let manifest_json = serde_json::to_string_pretty(&manifest)?;
    for manifest_path in &paths.native_host_manifest_paths {
        fs::write(manifest_path, &manifest_json).with_context(|| {
            format!("writing native host manifest {}", manifest_path.display())
        })?;
    }

    let windows_task = format!(
        r#"<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Author>Mace</Author>
    <Description>{task_name}</Description>
  </RegistrationInfo>
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
    </LogonTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <RunLevel>LeastPrivilege</RunLevel>
      <LogonType>InteractiveToken</LogonType>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings>
      <StopOnIdleEnd>false</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>true</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <DisallowStartOnRemoteAppSession>false</DisallowStartOnRemoteAppSession>
    <UseUnifiedSchedulingEngine>true</UseUnifiedSchedulingEngine>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>7</Priority>
    <RestartOnFailure>
      <Interval>PT1M</Interval>
      <Count>999</Count>
    </RestartOnFailure>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>{command}</Command>
      <Arguments>daemon</Arguments>
    </Exec>
  </Actions>
</Task>
"#,
        task_name = WINDOWS_TASK_NAME,
        command = xml_escape(&exe_path.display().to_string())
    );
    fs::write(&paths.windows_task_path, windows_task)
        .with_context(|| format!("writing {}", paths.windows_task_path.display()))?;

    let launch_agent = format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>{label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>{command}</string>
    <string>daemon</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>StandardOutPath</key>
  <string>{stdout}</string>
  <key>StandardErrorPath</key>
  <string>{stderr}</string>
</dict>
</plist>
"#,
        label = MACOS_LAUNCH_AGENT_LABEL,
        command = xml_escape(&exe_path.display().to_string()),
        stdout = xml_escape(&paths.runtime_dir.join("daemon.log").display().to_string()),
        stderr = xml_escape(&paths.runtime_dir.join("daemon.err.log").display().to_string())
    );
    fs::write(&paths.macos_launch_agent_path, launch_agent)
        .with_context(|| format!("writing {}", paths.macos_launch_agent_path.display()))?;

    Ok(())
}

fn xml_escape(input: &str) -> String {
    input
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn read_stdio_message() -> Result<Option<Value>> {
    let mut stdin = io::stdin();
    let mut len_buf = [0u8; 4];
    match stdin.read_exact(&mut len_buf) {
        Ok(()) => {}
        Err(err) if err.kind() == io::ErrorKind::UnexpectedEof => return Ok(None),
        Err(err) => return Err(err).context("reading native messaging frame length"),
    }

    let msg_len = u32::from_le_bytes(len_buf) as usize;
    let mut payload = vec![0u8; msg_len];
    stdin
        .read_exact(&mut payload)
        .context("reading native messaging payload")?;
    let value = serde_json::from_slice(&payload).context("decoding native messaging JSON")?;
    Ok(Some(value))
}

fn write_stdio_message(value: &Value) -> Result<()> {
    let bytes = serde_json::to_vec(value)?;
    let mut stdout = io::stdout();
    stdout
        .write_all(&(bytes.len() as u32).to_le_bytes())
        .context("writing native messaging length")?;
    stdout
        .write_all(&bytes)
        .context("writing native messaging payload")?;
    stdout.flush().context("flushing native messaging payload")?;
    Ok(())
}

fn write_ipc_message(writer: &mut BufWriter<Stream>, value: &Value) -> Result<()> {
    writer.write_all(serde_json::to_string(value)?.as_bytes())?;
    writer.write_all(b"\n")?;
    writer.flush()?;
    Ok(())
}

fn read_ipc_message(reader: &mut BufReader<Stream>) -> Result<Option<Value>> {
    let mut line = String::new();
    let bytes = reader.read_line(&mut line)?;
    if bytes == 0 {
        return Ok(None);
    }
    let value = serde_json::from_str(line.trim_end())?;
    Ok(Some(value))
}

fn rpc_success(id: String, result: Value) -> Value {
    serde_json::to_value(RpcSuccess {
        jsonrpc: "2.0",
        id,
        result,
    })
    .expect("serializing success")
}

fn rpc_failure(id: Option<String>, code: i64, message: impl Into<String>) -> Value {
    serde_json::to_value(RpcFailure {
        jsonrpc: "2.0",
        id,
        error: RpcError {
            code,
            message: message.into(),
            data: None,
        },
    })
    .expect("serializing failure")
}

fn daemon_dispatch(request: RpcRequest, state: &mut DaemonState) -> Value {
    match request.method.as_str() {
        "hello" => {
            let params = request
                .params
                .and_then(|v| serde_json::from_value::<HelloParams>(v).ok());
            if let Some(params) = params {
                state.last_extension_session_id = Some(params.extension_session_id);
            }
            rpc_success(
                request.id.unwrap_or_else(session_id),
                json!({
                    "nativeSessionId": state.native_session_id,
                    "overlayStatus": state.overlay_status,
                    "transport": "ipc",
                    "platform": state.platform,
                    "supportedFeatures": state.supported_features,
                }),
            )
        }
        "ping" => {
            let params = request
                .params
                .and_then(|v| serde_json::from_value::<PingParams>(v).ok());
            if let Some(params) = params {
                state.last_extension_session_id = Some(params.extension_session_id);
                state.last_ping_at = Some(params.sent_at);
            }
            rpc_success(
                request.id.unwrap_or_else(session_id),
                json!({
                    "pong": true,
                    "receivedAt": now_ms(),
                    "nativeSessionId": state.native_session_id,
                }),
            )
        }
        "status" => rpc_success(
            request.id.unwrap_or_else(session_id),
            json!({
                "service": state.service_status,
                "overlayStatus": state.overlay_status,
                "transport": "ipc",
                "nativeSessionId": state.native_session_id,
                "restartCount": state.restart_count,
                "platform": state.platform,
                "supportedFeatures": state.supported_features,
            }),
        ),
        other => rpc_failure(
            request.id,
            -32601,
            format!("unknown method: {other}"),
        ),
    }
}

fn spawn_overlay_thread() {
    if !matches!(env::consts::OS, "macos" | "windows") {
        return;
    }

    std::thread::spawn(|| {
        if let Err(error) = overlay::run_overlay() {
            eprintln!("overlay error: {error:#}");
        }
    });
}

fn start_daemon_process() -> Result<Child> {
    let exe = env::current_exe().context("resolving current executable")?;
    Command::new(exe)
        .arg("daemon")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .context("spawning daemon process")
}

fn ensure_daemon_running(paths: &AppPaths) -> Result<()> {
    let socket_name = daemon_socket_name(paths)?;
    if Stream::connect(socket_name.borrow()).is_ok() {
        return Ok(());
    }

    let mut child = start_daemon_process()?;
    for _ in 0..50 {
        std::thread::sleep(Duration::from_millis(100));
        if Stream::connect(socket_name.borrow()).is_ok() {
            return Ok(());
        }
        if let Some(status) = child.try_wait().context("polling daemon process")? {
            return Err(anyhow!("daemon exited before accepting IPC: {status}"));
        }
    }

    Err(anyhow!("timed out waiting for daemon socket"))
}

fn run_host() -> Result<()> {
    let paths = AppPaths::discover()?;
    let extension_id = env::var("OVERLAY_EXTENSION_ID")
        .unwrap_or_else(|_| "nnhnfinhcolokbaecbidapfdkbibfoca".to_string());
    ensure_assets(&paths, &extension_id)?;
    ensure_daemon_running(&paths)?;

    let socket_name = daemon_socket_name(&paths)?;
    let stream = Stream::connect(socket_name.borrow()).context("connecting to daemon IPC")?;
    let reader_stream = stream.try_clone().context("cloning IPC stream")?;
    let mut reader = BufReader::new(reader_stream);
    let mut writer = BufWriter::new(stream);

    while let Some(value) = read_stdio_message()? {
        write_ipc_message(&mut writer, &value)?;
        match read_ipc_message(&mut reader)? {
            Some(response) => write_stdio_message(&response)?,
            None => {
                let failure = rpc_failure(None, -32000, "daemon disconnected");
                write_stdio_message(&failure)?;
                break;
            }
        }
    }

    Ok(())
}

fn run_daemon() -> Result<()> {
    let paths = AppPaths::discover()?;
    let extension_id = env::var("OVERLAY_EXTENSION_ID")
        .unwrap_or_else(|_| "nnhnfinhcolokbaecbidapfdkbibfoca".to_string());
    ensure_assets(&paths, &extension_id)?;

    let mut state = load_state(&paths)?;
    state.restart_count = state.restart_count.saturating_add(1);
    state.native_session_id = session_id();
    state.overlay_status = overlay_status();
    state.service_status = "ready".to_string();
    state.platform = platform_name();
    state.supported_features = supported_features();
    save_state(&paths, &state)?;

    spawn_overlay_thread();

    let socket_name = daemon_socket_name(&paths)?;
    let listener = ListenerOptions::new()
        .name(socket_name.borrow())
        .reclaim_name(true)
        .try_overwrite(true)
        .create_sync()
        .context("creating daemon IPC listener")?;

    for conn in listener.incoming() {
        match conn {
            Ok(stream) => {
                if let Err(error) = handle_daemon_connection(stream, &paths, &mut state) {
                    eprintln!("daemon connection error: {error:#}");
                }
            }
            Err(error) => {
                eprintln!("incoming IPC error: {error}");
            }
        }
    }

    Ok(())
}

fn handle_daemon_connection(
    stream: Stream,
    paths: &AppPaths,
    state: &mut DaemonState,
) -> Result<()> {
    let reader_stream = stream.try_clone().context("cloning daemon stream")?;
    let mut reader = BufReader::new(reader_stream);
    let mut writer = BufWriter::new(stream);

    while let Some(value) = read_ipc_message(&mut reader)? {
        let request: RpcRequest = serde_json::from_value(value).context("parsing daemon request")?;
        let response = daemon_dispatch(request, state);
        save_state(paths, state)?;
        write_ipc_message(&mut writer, &response)?;
    }

    Ok(())
}

fn install_assets() -> Result<()> {
    let paths = AppPaths::discover()?;
    let extension_id = env::var("OVERLAY_EXTENSION_ID")
        .unwrap_or_else(|_| "nnhnfinhcolokbaecbidapfdkbibfoca".to_string());
    ensure_assets(&paths, &extension_id)?;
    for manifest_path in &paths.native_host_manifest_paths {
        println!("native host manifest: {}", manifest_path.display());
    }
    println!("windows task template: {}", paths.windows_task_path.display());
    println!("macOS launch agent template: {}", paths.macos_launch_agent_path.display());
    Ok(())
}

fn main() -> Result<()> {
    match env::args().nth(1).as_deref() {
        Some("daemon") => run_daemon(),
        Some("install-assets") => install_assets(),
        _ => run_host(),
    }
}

mod overlay {
    use super::*;

    #[cfg(any(target_os = "macos", target_os = "windows"))]
    use std::num::NonZeroU32;
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    use std::sync::Arc;
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    use softbuffer::{Context as SoftContext, Surface};
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    use winit::application::ApplicationHandler;
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    use winit::dpi::LogicalSize;
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    use winit::event::WindowEvent;
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    use winit::event_loop::{ActiveEventLoop, EventLoop, OwnedDisplayHandle};
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    use winit::window::{Window, WindowAttributes, WindowId, WindowLevel};

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    pub fn run_overlay() -> Result<()> {
        Ok(())
    }

    #[cfg(any(target_os = "macos", target_os = "windows"))]
    pub fn run_overlay() -> Result<()> {
        let event_loop = EventLoop::builder().build()?;
        let mut app = OverlayApp::new(&event_loop)?;
        event_loop.run_app(&mut app)?;
        Ok(())
    }

    #[cfg(any(target_os = "macos", target_os = "windows"))]
    struct OverlayApp {
        context: Option<SoftContext<OwnedDisplayHandle>>,
        window: Option<Arc<Window>>,
        surface: Option<Surface<OwnedDisplayHandle, Arc<Window>>>,
        size: (u32, u32),
    }

    #[cfg(any(target_os = "macos", target_os = "windows"))]
    impl OverlayApp {
        fn new(event_loop: &EventLoop<()>) -> Result<Self> {
            let context = Some(SoftContext::new(event_loop.owned_display_handle()).map_err(|e| anyhow::anyhow!("{e}"))?);
            Ok(Self {
                context,
                window: None,
                surface: None,
                size: (900, 120),
            })
        }

        fn attributes() -> WindowAttributes {
            Window::default_attributes()
                .with_title("Native Overlay HUD")
                .with_transparent(true)
                .with_decorations(false)
                .with_resizable(false)
                .with_window_level(WindowLevel::AlwaysOnTop)
                .with_inner_size(LogicalSize::new(900.0, 120.0))
        }

        fn create_window(&mut self, event_loop: &ActiveEventLoop) -> Result<()> {
            let window = Arc::new(event_loop.create_window(Self::attributes())?);
            window.set_cursor_hittest(false)?;
            #[cfg(target_os = "windows")]
            {
                use winit::platform::windows::WindowExtWindows;
                window.set_skip_taskbar(true);
            }
            #[cfg(target_os = "macos")]
            {
                use winit::platform::macos::WindowExtMacOS;
                window.set_has_shadow(false);
                let _ = window.set_simple_fullscreen(false);
            }

            let mut surface = Surface::new(self.context.as_ref().unwrap(), Arc::clone(&window)).map_err(|e| anyhow::anyhow!("{e}"))?;
            let width = NonZeroU32::new(self.size.0).unwrap();
            let height = NonZeroU32::new(self.size.1).unwrap();
            surface.resize(width, height).map_err(|e| anyhow::anyhow!("{e}"))?;
            self.surface = Some(surface);
            self.window = Some(window);
            Ok(())
        }

        fn redraw(&mut self) -> Result<()> {
            let Some(surface) = self.surface.as_mut() else {
                return Ok(());
            };
            let mut buffer = surface.buffer_mut().map_err(|e| anyhow::anyhow!("{e}"))?;
            let width = buffer.width().get() as usize;
            let height = buffer.height().get() as usize;
            for y in 0..height {
                for x in 0..width {
                    let idx = y * width + x;
                    let alpha_band = y < 8 || y > height.saturating_sub(8);
                    let accent = x > 12 && x < 40 && y > 24 && y < 52;
                    let color = if accent {
                        0x00_73_A7_FF
                    } else if alpha_band {
                        0x00_28_2A_36
                    } else {
                        0x00_12_14_1C
                    };
                    buffer[idx] = color;
                }
            }
            if let Some(window) = &self.window {
                window.pre_present_notify();
            }
            buffer.present().map_err(|e| anyhow::anyhow!("{e}"))?;
            Ok(())
        }
    }

    #[cfg(any(target_os = "macos", target_os = "windows"))]
    impl ApplicationHandler for OverlayApp {
        fn resumed(&mut self, event_loop: &ActiveEventLoop) {
            if self.window.is_none() {
                if let Err(error) = self.create_window(event_loop) {
                    eprintln!("overlay create error: {error:#}");
                    event_loop.exit();
                }
            }
            if let Some(window) = &self.window {
                window.request_redraw();
            }
        }

        fn window_event(
            &mut self,
            event_loop: &ActiveEventLoop,
            _window_id: WindowId,
            event: WindowEvent,
        ) {
            match event {
                WindowEvent::CloseRequested => event_loop.exit(),
                WindowEvent::RedrawRequested => {
                    if let Err(error) = self.redraw() {
                        eprintln!("overlay redraw error: {error:#}");
                        event_loop.exit();
                    }
                }
                WindowEvent::Resized(size) => {
                    self.size = (size.width.max(1), size.height.max(1));
                    if let Some(surface) = self.surface.as_mut() {
                        let _ = surface.resize(
                            NonZeroU32::new(self.size.0).unwrap(),
                            NonZeroU32::new(self.size.1).unwrap(),
                        );
                    }
                    if let Some(window) = &self.window {
                        window.request_redraw();
                    }
                }
                _ => {}
            }
        }
    }
}
