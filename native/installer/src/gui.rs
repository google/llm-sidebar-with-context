/// Egui-based setup wizard for LLM Sidebar.
///
/// Themed with the Kinetic Grid design system:
///   - 0px border radius everywhere
///   - Dark surface (#0e0e0e) foundation
///   - Cobalt (#78b4fe) primary accent
///   - No shadows, no gradients
///   - Inter font, left-aligned
use eframe::egui;

use crate::{browsers, diagnose, DEFAULT_EXTENSION_ID};

// ── Kinetic Grid Colors ────────────────────────────────────────────────

const SURFACE: egui::Color32 = egui::Color32::from_rgb(0x0e, 0x0e, 0x0e);
const SURFACE_CONTAINER_LOW: egui::Color32 = egui::Color32::from_rgb(0x13, 0x13, 0x13);
const SURFACE_CONTAINER: egui::Color32 = egui::Color32::from_rgb(0x19, 0x1a, 0x1a);
const SURFACE_BRIGHT: egui::Color32 = egui::Color32::from_rgb(0x2c, 0x2c, 0x2c);
const ON_SURFACE: egui::Color32 = egui::Color32::from_rgb(0xff, 0xff, 0xff);
const ON_SURFACE_VARIANT: egui::Color32 = egui::Color32::from_rgb(0xad, 0xaa, 0xaa);
const PRIMARY: egui::Color32 = egui::Color32::from_rgb(0x78, 0xb4, 0xfe);
const ON_PRIMARY: egui::Color32 = egui::Color32::from_rgb(0x00, 0x32, 0x5b);
const SECONDARY: egui::Color32 = egui::Color32::from_rgb(0x00, 0x6e, 0x00);
const TERTIARY: egui::Color32 = egui::Color32::from_rgb(0x9f, 0x05, 0x19);

// ── Wizard Steps ───────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq)]
enum Step {
    Welcome,
    BrowserDetection,
    Installing,
    Diagnostics,
    Complete,
}

struct Wizard {
    step: Step,
    detected_browsers: Vec<browsers::Browser>,
    selected_browsers: Vec<bool>,
    install_report: Option<crate::InstallReport>,
    install_error: Option<String>,
    diagnostics_report: Option<String>,
    extension_id: String,
}

impl Default for Wizard {
    fn default() -> Self {
        Self {
            step: Step::Welcome,
            detected_browsers: Vec::new(),
            selected_browsers: Vec::new(),
            install_report: None,
            install_error: None,
            diagnostics_report: None,
            extension_id: DEFAULT_EXTENSION_ID.to_string(),
        }
    }
}

pub fn run_wizard() {
    let options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_inner_size([560.0, 480.0])
            .with_min_inner_size([560.0, 480.0])
            .with_title("LLM Sidebar Setup"),
        ..Default::default()
    };

    eframe::run_native(
        "LLM Sidebar Setup",
        options,
        Box::new(|cc| {
            apply_kinetic_grid_theme(&cc.egui_ctx);
            Ok(Box::new(Wizard::default()))
        }),
    )
    .expect("Failed to launch setup wizard");
}

fn apply_kinetic_grid_theme(ctx: &egui::Context) {
    let mut style = (*ctx.style()).clone();

    // 0px border radius everywhere (Kinetic Grid mandate)
    style.visuals.window_rounding = egui::Rounding::ZERO;
    style.visuals.widgets.noninteractive.rounding = egui::Rounding::ZERO;
    style.visuals.widgets.inactive.rounding = egui::Rounding::ZERO;
    style.visuals.widgets.hovered.rounding = egui::Rounding::ZERO;
    style.visuals.widgets.active.rounding = egui::Rounding::ZERO;
    style.visuals.widgets.open.rounding = egui::Rounding::ZERO;
    style.visuals.menu_rounding = egui::Rounding::ZERO;

    // Dark theme foundation
    style.visuals.dark_mode = true;
    style.visuals.panel_fill = SURFACE;
    style.visuals.window_fill = SURFACE;
    style.visuals.extreme_bg_color = SURFACE_CONTAINER_LOW;

    // No shadows
    style.visuals.window_shadow = egui::Shadow::NONE;
    style.visuals.popup_shadow = egui::Shadow::NONE;

    // Widget colors
    style.visuals.widgets.noninteractive.bg_fill = SURFACE_CONTAINER;
    style.visuals.widgets.noninteractive.fg_stroke = egui::Stroke::new(1.0, ON_SURFACE_VARIANT);

    style.visuals.widgets.inactive.bg_fill = SURFACE_BRIGHT;
    style.visuals.widgets.inactive.fg_stroke = egui::Stroke::new(1.0, ON_SURFACE);

    style.visuals.widgets.hovered.bg_fill = PRIMARY;
    style.visuals.widgets.hovered.fg_stroke = egui::Stroke::new(1.0, ON_PRIMARY);

    style.visuals.widgets.active.bg_fill = PRIMARY;
    style.visuals.widgets.active.fg_stroke = egui::Stroke::new(1.0, ON_PRIMARY);

    // Selection (checkboxes, etc.)
    style.visuals.selection.bg_fill = PRIMARY;
    style.visuals.selection.stroke = egui::Stroke::new(1.0, ON_PRIMARY);

    // Text colors
    style.visuals.override_text_color = Some(ON_SURFACE);

    ctx.set_style(style);
}

impl eframe::App for Wizard {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        egui::CentralPanel::default()
            .frame(egui::Frame::none().fill(SURFACE).inner_margin(0.0))
            .show(ctx, |ui| {
                // Header bar
                ui.allocate_ui_with_layout(
                    egui::vec2(ui.available_width(), 48.0),
                    egui::Layout::left_to_right(egui::Align::Center),
                    |ui| {
                        let rect = ui.max_rect();
                        ui.painter()
                            .rect_filled(rect, egui::Rounding::ZERO, SURFACE_CONTAINER_LOW);
                        ui.add_space(16.0);
                        ui.label(
                            egui::RichText::new("LLM SIDEBAR SETUP")
                                .size(14.0)
                                .strong()
                                .color(PRIMARY),
                        );
                        ui.add_space(16.0);
                        ui.label(
                            egui::RichText::new(step_label(self.step))
                                .size(11.0)
                                .color(ON_SURFACE_VARIANT),
                        );
                    },
                );

                ui.add_space(4.0);

                // Step indicator bar
                ui.horizontal(|ui| {
                    let steps = [
                        Step::Welcome,
                        Step::BrowserDetection,
                        Step::Installing,
                        Step::Diagnostics,
                        Step::Complete,
                    ];
                    let w = ui.available_width() / steps.len() as f32;
                    for s in &steps {
                        let color = if *s == self.step {
                            PRIMARY
                        } else if (*s as u8) < (self.step as u8) {
                            SECONDARY
                        } else {
                            SURFACE_BRIGHT
                        };
                        let (rect, _) = ui.allocate_exact_size(
                            egui::vec2(w - 2.0, 3.0),
                            egui::Sense::hover(),
                        );
                        ui.painter().rect_filled(rect, egui::Rounding::ZERO, color);
                    }
                });

                ui.add_space(24.0);

                // Content area
                egui::Frame::none()
                    .inner_margin(egui::Margin::symmetric(32.0, 8.0))
                    .show(ui, |ui| match self.step {
                        Step::Welcome => self.show_welcome(ui),
                        Step::BrowserDetection => self.show_browser_detection(ui),
                        Step::Installing => self.show_installing(ui),
                        Step::Diagnostics => self.show_diagnostics(ui),
                        Step::Complete => self.show_complete(ui),
                    });

                // Bottom nav
                ui.with_layout(egui::Layout::bottom_up(egui::Align::RIGHT), |ui| {
                    ui.add_space(16.0);
                    ui.horizontal(|ui| {
                        ui.add_space(32.0);
                        self.show_nav_buttons(ui);
                    });
                });
            });
    }
}

impl Wizard {
    fn show_welcome(&mut self, ui: &mut egui::Ui) {
        ui.label(
            egui::RichText::new("WELCOME")
                .size(36.0)
                .strong()
                .color(ON_SURFACE),
        );
        ui.add_space(16.0);
        ui.label(
            egui::RichText::new(
                "This wizard will install the LLM Sidebar native companion \
                 on your system. Here's what happens:",
            )
            .size(14.0)
            .color(ON_SURFACE_VARIANT),
        );
        ui.add_space(16.0);

        let steps = [
            ("01", "DETECT BROWSERS", "Find all Chromium-based browsers on your system"),
            ("02", "INSTALL BINARIES", "Copy the native messaging host and overlay companion"),
            ("03", "REGISTER", "Write native messaging manifests so Chrome can find the host"),
            ("04", "VERIFY", "Run diagnostics to confirm everything works"),
        ];

        for (num, title, desc) in &steps {
            ui.add_space(4.0);
            ui.horizontal(|ui| {
                ui.label(
                    egui::RichText::new(*num)
                        .size(24.0)
                        .strong()
                        .color(PRIMARY),
                );
                ui.add_space(12.0);
                ui.vertical(|ui| {
                    ui.label(
                        egui::RichText::new(*title)
                            .size(12.0)
                            .strong()
                            .color(ON_SURFACE),
                    );
                    ui.label(
                        egui::RichText::new(*desc)
                            .size(11.0)
                            .color(ON_SURFACE_VARIANT),
                    );
                });
            });
        }
    }

    fn show_browser_detection(&mut self, ui: &mut egui::Ui) {
        // Detect on first visit
        if self.detected_browsers.is_empty() {
            self.detected_browsers = browsers::detect_browsers();
            self.selected_browsers = vec![true; self.detected_browsers.len()];
        }

        ui.label(
            egui::RichText::new("BROWSER\nDETECTION")
                .size(36.0)
                .strong()
                .color(ON_SURFACE),
        );
        ui.add_space(12.0);

        if self.detected_browsers.is_empty() {
            ui.label(
                egui::RichText::new(
                    "No Chromium-based browsers detected. \
                     The installer can still copy binaries, but native messaging \
                     won't be registered until a browser is installed.",
                )
                .size(13.0)
                .color(TERTIARY),
            );
        } else {
            ui.label(
                egui::RichText::new(
                    "Select which browsers to register native messaging for:",
                )
                .size(13.0)
                .color(ON_SURFACE_VARIANT),
            );
            ui.add_space(12.0);

            for (i, browser) in self.detected_browsers.clone().iter().enumerate() {
                ui.horizontal(|ui| {
                    let checked = &mut self.selected_browsers[i];
                    ui.checkbox(checked, "");
                    ui.label(
                        egui::RichText::new(&browser.name)
                            .size(14.0)
                            .strong()
                            .color(if *checked { ON_SURFACE } else { ON_SURFACE_VARIANT }),
                    );
                });
                ui.label(
                    egui::RichText::new(format!(
                        "    Manifest dir: {}",
                        browser.native_messaging_dir.display()
                    ))
                    .size(10.0)
                    .color(ON_SURFACE_VARIANT),
                );
                ui.add_space(4.0);
            }
        }

        // What native messaging actually does
        ui.add_space(16.0);
        egui::Frame::none()
            .fill(SURFACE_CONTAINER_LOW)
            .inner_margin(12.0)
            .show(ui, |ui| {
                ui.label(
                    egui::RichText::new("WHAT IS NATIVE MESSAGING?")
                        .size(11.0)
                        .strong()
                        .color(PRIMARY),
                );
                ui.add_space(4.0);
                ui.label(
                    egui::RichText::new(
                        "Chrome extensions run in a sandbox and can't talk to your \
                         desktop directly. A native messaging host is a small program \
                         that Chrome launches to bridge this gap. We write a JSON \
                         manifest file to tell each browser where to find it.",
                    )
                    .size(11.0)
                    .color(ON_SURFACE_VARIANT),
                );
            });
    }

    fn show_installing(&mut self, ui: &mut egui::Ui) {
        // Run install on first visit to this step
        if self.install_report.is_none() && self.install_error.is_none() {
            match crate::install(&self.extension_id) {
                Ok(report) => self.install_report = Some(report),
                Err(e) => self.install_error = Some(e.to_string()),
            }
        }

        ui.label(
            egui::RichText::new("INSTALLING")
                .size(36.0)
                .strong()
                .color(ON_SURFACE),
        );
        ui.add_space(12.0);

        if let Some(ref err) = self.install_error {
            ui.label(
                egui::RichText::new("Installation failed:")
                    .size(14.0)
                    .color(TERTIARY),
            );
            ui.add_space(8.0);
            ui.label(
                egui::RichText::new(err)
                    .size(12.0)
                    .color(ON_SURFACE_VARIANT),
            );
            return;
        }

        if let Some(ref report) = self.install_report {
            let items: Vec<(&str, bool, &str)> = vec![
                ("Native host binary", report.host_installed, "Copied to install directory"),
                (
                    "Overlay companion",
                    report.overlay_installed,
                    if report.overlay_installed {
                        "Copied to install directory"
                    } else {
                        "Not found (optional)"
                    },
                ),
                ("Extension CRX", report.crx_installed, "Registered via external extension"),
            ];

            for (label, ok, detail) in &items {
                ui.horizontal(|ui| {
                    let icon = if *ok { "+" } else { "?" };
                    let color = if *ok { SECONDARY } else { ON_SURFACE_VARIANT };
                    ui.label(
                        egui::RichText::new(format!("[{icon}]"))
                            .size(14.0)
                            .strong()
                            .color(color),
                    );
                    ui.label(
                        egui::RichText::new(*label)
                            .size(13.0)
                            .strong()
                            .color(ON_SURFACE),
                    );
                    ui.label(
                        egui::RichText::new(*detail)
                            .size(11.0)
                            .color(ON_SURFACE_VARIANT),
                    );
                });
                ui.add_space(2.0);
            }

            ui.add_space(8.0);
            ui.label(
                egui::RichText::new("BROWSER REGISTRATION")
                    .size(12.0)
                    .strong()
                    .color(PRIMARY),
            );
            ui.add_space(4.0);

            for name in &report.browsers_registered {
                ui.horizontal(|ui| {
                    ui.label(
                        egui::RichText::new("[+]")
                            .size(14.0)
                            .strong()
                            .color(SECONDARY),
                    );
                    ui.label(
                        egui::RichText::new(name)
                            .size(13.0)
                            .color(ON_SURFACE),
                    );
                });
            }

            for (name, err) in &report.browser_errors {
                ui.horizontal(|ui| {
                    ui.label(
                        egui::RichText::new("[x]")
                            .size(14.0)
                            .strong()
                            .color(TERTIARY),
                    );
                    ui.label(
                        egui::RichText::new(format!("{name}: {err}"))
                            .size(13.0)
                            .color(TERTIARY),
                    );
                });
            }
        }
    }

    fn show_diagnostics(&mut self, ui: &mut egui::Ui) {
        if self.diagnostics_report.is_none() {
            self.diagnostics_report = Some(diagnose::run_diagnostics(&self.extension_id));
        }

        ui.label(
            egui::RichText::new("DIAGNOSTICS")
                .size(36.0)
                .strong()
                .color(ON_SURFACE),
        );
        ui.add_space(12.0);

        if let Some(ref report) = self.diagnostics_report {
            egui::Frame::none()
                .fill(SURFACE_CONTAINER_LOW)
                .inner_margin(12.0)
                .show(ui, |ui| {
                    ui.label(
                        egui::RichText::new(report)
                            .size(11.0)
                            .color(ON_SURFACE_VARIANT)
                            .monospace(),
                    );
                });
        }

        ui.add_space(12.0);
        if ui
            .button(
                egui::RichText::new("RE-RUN DIAGNOSTICS")
                    .size(12.0)
                    .strong(),
            )
            .clicked()
        {
            self.diagnostics_report = Some(diagnose::run_diagnostics(&self.extension_id));
        }
    }

    fn show_complete(&mut self, ui: &mut egui::Ui) {
        ui.label(
            egui::RichText::new("SETUP\nCOMPLETE")
                .size(36.0)
                .strong()
                .color(ON_SURFACE),
        );
        ui.add_space(16.0);

        let has_errors = self
            .install_report
            .as_ref()
            .map(|r| !r.browser_errors.is_empty())
            .unwrap_or(false);

        if has_errors || self.install_error.is_some() {
            ui.label(
                egui::RichText::new(
                    "Installation completed with warnings. \
                     Check the diagnostics page for details.",
                )
                .size(14.0)
                .color(ON_SURFACE_VARIANT),
            );
        } else {
            ui.label(
                egui::RichText::new(
                    "Everything is installed and registered. \
                     Open Chrome and click the LLM Sidebar extension icon to get started.",
                )
                .size(14.0)
                .color(ON_SURFACE_VARIANT),
            );
        }

        ui.add_space(24.0);
        ui.label(
            egui::RichText::new("NEXT STEPS")
                .size(12.0)
                .strong()
                .color(PRIMARY),
        );
        ui.add_space(8.0);

        let next_steps = [
            "Open Chrome (or your chosen browser)",
            "Click the LLM Sidebar extension icon or press Ctrl+Shift+S",
            "Enter your API key in Settings",
            "Start chatting with full web context",
        ];

        for (i, step) in next_steps.iter().enumerate() {
            ui.horizontal(|ui| {
                ui.label(
                    egui::RichText::new(format!("{:02}", i + 1))
                        .size(16.0)
                        .strong()
                        .color(PRIMARY),
                );
                ui.add_space(8.0);
                ui.label(
                    egui::RichText::new(*step)
                        .size(13.0)
                        .color(ON_SURFACE_VARIANT),
                );
            });
            ui.add_space(2.0);
        }
    }

    fn show_nav_buttons(&mut self, ui: &mut egui::Ui) {
        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
            ui.add_space(32.0);

            match self.step {
                Step::Welcome => {
                    if ui
                        .button(egui::RichText::new("BEGIN SETUP  >>").size(13.0).strong())
                        .clicked()
                    {
                        self.step = Step::BrowserDetection;
                    }
                }
                Step::BrowserDetection => {
                    if ui
                        .button(egui::RichText::new("INSTALL  >>").size(13.0).strong())
                        .clicked()
                    {
                        self.step = Step::Installing;
                    }
                    if ui
                        .button(egui::RichText::new("<< BACK").size(13.0))
                        .clicked()
                    {
                        self.step = Step::Welcome;
                    }
                }
                Step::Installing => {
                    if self.install_report.is_some() || self.install_error.is_some() {
                        if ui
                            .button(
                                egui::RichText::new("VERIFY  >>").size(13.0).strong(),
                            )
                            .clicked()
                        {
                            self.step = Step::Diagnostics;
                        }
                    }
                }
                Step::Diagnostics => {
                    if ui
                        .button(egui::RichText::new("FINISH  >>").size(13.0).strong())
                        .clicked()
                    {
                        self.step = Step::Complete;
                    }
                    if ui
                        .button(egui::RichText::new("<< BACK").size(13.0))
                        .clicked()
                    {
                        self.step = Step::Installing;
                    }
                }
                Step::Complete => {
                    if ui
                        .button(egui::RichText::new("CLOSE").size(13.0).strong())
                        .clicked()
                    {
                        std::process::exit(0);
                    }
                }
            }
        });
    }
}

fn step_label(step: Step) -> &'static str {
    match step {
        Step::Welcome => "STEP 1 OF 5 // WELCOME",
        Step::BrowserDetection => "STEP 2 OF 5 // BROWSER DETECTION",
        Step::Installing => "STEP 3 OF 5 // INSTALLATION",
        Step::Diagnostics => "STEP 4 OF 5 // VERIFICATION",
        Step::Complete => "STEP 5 OF 5 // COMPLETE",
    }
}
