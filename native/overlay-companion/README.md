# Native Overlay Companion

This crate provides the foundation for a small Rust-based native companion for the Chrome extension.

## Modes

- `overlay-companion` (default): native-messaging host bridge launched by Chrome.
- `overlay-companion daemon`: long-lived daemon that owns the local IPC endpoint and, on macOS/Windows, the HUD/overlay window thread.
- `overlay-companion install-assets`: emits the native host manifest and autostart templates.

## Architecture

Chrome talks to the stdio host process via native messaging. The host process forwards JSON-RPC messages over a local socket to the long-lived daemon. This lets the daemon survive extension service-worker restarts while still keeping Chrome integration simple and CDP-free.

## Boot Assets

`install-assets` generates:

- a native messaging host manifest for Chrome for Testing on Linux,
- a launchd LaunchAgent plist template for macOS,
- a Task Scheduler XML template for Windows.

The daemon answers `hello`, `ping`, and `status` JSON-RPC methods. The intended extension heartbeat cadence is 22 seconds.
