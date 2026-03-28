# Design System Specification: The Kinetic Grid

## 1. Overview & Creative North Star: "The Digital Architect"
This design system rejects the soft, blurred aesthetics of modern mobile OSs in favor of **The Digital Architect**. Our North Star is a high-end, editorial interpretation of Swiss Design and the Metro philosophy. It is a system of absolute precision, high-velocity information density, and unapologetic flat geometry.

We break the "template" look not through decoration, but through **Intentional Asymmetry** and **Scale Extremes**. By placing massive `display-lg` typography against dense, micro-copy grids, we create a rhythmic tension that feels premium and curated. This is not a "simple" flat design; it is a sophisticated orchestration of mathematical alignment and bold color blocking.

## 2. Colors & Surface Logic
The palette is built on a "Deep Charcoal" foundation (`surface: #0e0e0e`) to allow the high-contrast accent "Live Tiles" to vibrate with energy.

### The "No-Line" Rule
**Explicit Mandate:** 1px solid borders are strictly prohibited for sectioning or containment. Boundaries must be defined solely by the juxtaposition of color blocks. 
- To separate a sidebar from a main feed, transition from `surface` (#0e0e0e) to `surface_container_low` (#131313). 
- Use the **Edge-to-Edge Fill**: Elements should meet at a perfect 0px seam, allowing the eye to perceive the change in tonal value as the structural divider.

### Surface Hierarchy & Nesting
Instead of shadows, we use **Tonal Stacking** to imply focus:
1.  **Base Layer:** `surface` (#0e0e0e)
2.  **Sectioning:** `surface_container_low` (#131313) or `surface_container` (#191a1a)
3.  **Active/Interactive Elements:** Primary colors or `surface_bright` (#2c2c2c)

### Accent Utilization (The "Live" Palette)
Accents are functional, not decorative. Each color should denote a specific content "DNA":
- **Cobalt (`primary`):** System actions and primary navigation.
- **Emerald (`secondary`):** Success states and financial/growth data.
- **Crimson (`tertiary`):** Urgent alerts or high-priority media.
- **Mango/Violet:** Categories, tags, or "Live Tile" differentiators.

## 3. Typography: The Editorial Voice
We utilize **Inter** (as a high-performance alternative to Segoe UI) to maintain a clean, modernist aesthetic. The hierarchy is designed for "Scan-ability."

*   **Display (lg/md):** Used for "Hero Tiles" or section headers. Use `on_surface` with tight letter-spacing (-0.02em) to create a blocky, architectural feel.
*   **Headline (sm):** Used for "Live Tile" titles. Must always be uppercase when used inside high-contrast color blocks to ensure maximum authority.
*   **Body (md/lg):** Reserved for long-form data. Use `on_surface_variant` (#adaaaa) to reduce visual fatigue against the dark background.
*   **Labels:** Use `label-sm` for metadata. Despite the small size, ensure they are high-contrast (#ffffff) to maintain the "Precision Instrument" look.

## 4. Elevation & Depth: Tonal Layering
Traditional elevation (Z-axis) is replaced by **X/Y Impact**. We do not use shadows or glassmorphism, as they soften the "Sharp Corner" mandate.

*   **The Layering Principle:** Depth is achieved by "punching out" or "stacking." A "Live Tile" in `secondary_container` (#006e00) sitting on a `surface` background provides all the hierarchy necessary.
*   **Zero-Opacity States:** Interactive states (hover/active) should be handled via color shifts (e.g., `primary` to `primary_dim`) or by overlaying a 10% white/black wash, never a shadow.
*   **The Ghost Border Fallback:** If a UI element (like a search input) risks disappearing into the background, use `outline_variant` (#484848) at **20% opacity**. This creates a "barely-there" guide that maintains the flat aesthetic.

## 5. Components

### Live Tiles (The Core Primitive)
The "Live Tile" is the fundamental building block.
*   **Geometry:** Strictly 0px border-radius.
*   **Padding:** Use `spacing-5` (1.1rem) as the internal standard.
*   **Behavior:** Tiles should be organized in a strict CSS Grid. Use "Spanning" (col-span-2) to create editorial rhythm.

### Buttons
*   **Primary:** Solid `primary` (#78b4fe) background with `on_primary` (#00325b) text. No rounded corners. 
*   **Secondary:** Solid `surface_bright` (#2c2c2c) or `outline`.
*   **Interaction:** On hover, the background should "invert" (text becomes background color, background becomes text color). This provides a high-end, responsive feel without using shadows.

### Input Fields
*   **Styling:** A bottom-only "Ghost Border" using `outline` (#767575). 
*   **Focus State:** The border transforms into a 2px solid `primary` (#78b4fe) line. 
*   **Error:** The entire background of the input block shifts to `error_container` (#9f0519) for immediate, "at-a-glance" recognition.

### Lists & Navigation
*   **Forbid Dividers:** Do not use lines between list items. Use `spacing-2` (0.4rem) gaps to let the background `surface` color act as a natural separator.
*   **Selection:** An active list item should be indicated by a solid 4px vertical "accent bar" on the left edge using a primary or secondary color.

## 6. Do’s and Don’ts

### Do:
*   **Embrace the Grid:** Everything must snap to the `spacing` scale. Alignment is the only "decoration" allowed.
*   **Use High Contrast:** Ensure text on colored tiles always meets WCAG AAA standards. Use `on_primary_container` or `on_secondary_container` values.
*   **Think Editorial:** Treat a dashboard like a high-end magazine layout. Use whitespace (negative space) as a structural element.

### Don't:
*   **No Rounded Corners:** Never use `border-radius`. Even a 1px radius breaks the system's integrity.
*   **No Gradients/Shadows:** If an element needs to stand out, use a bolder color or a larger typographic scale, not a visual effect.
*   **No Centering:** Favor left-aligned typography for almost all use cases to maintain the "Architectural" feel. Centered text feels too decorative and "soft."