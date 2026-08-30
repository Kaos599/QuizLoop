# Design System & UI Tokens

This document details the visual language implemented during the Memorang brand refactor.

## 1. Core Palette
We use a clean, clinical yet vibrant palette designed for educational focus.

- **Primary Teal** (`#21AB89`): Used for primary CTAs (buttons, active states, progress bars).
- **Deep Slate** (`#0F172A`): Used for high-priority text and headings to ensure maximum contrast.
- **Secondary Accents**:
  - `service-blue` (`#3B82F6`): Instant Generation
  - `service-pink` (`#F472B6`): Smart Feedback
  - `service-purple` (`#8B5CF6`): Adaptive Learning
  - `service-orange` (`#F59E0B`): Critical Feedback/Hints

## 2. Tailwind v4 Architecture
The project utilizes **Tailwind CSS v4**'s new native `@theme` configuration in `src/app/globals.css`.

```css
@theme {
  --color-primary: #21AB89;
  --color-slate-900: #0f172a;
  
  /* Radius Tokens */
  --radius-lg: 0.5rem;   /* 8px */
  --radius-xl: 0.75rem;  /* 12px */
  --radius-2xl: 1rem;    /* 16px */
  
  /* Custom Shadows */
  --shadow-card: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
}
```

## 3. Typography
- **Geist Sans**: The primary typeface for all UI elements.
- **Heading Strategy**: Headings utilize `-0.025em` tracking for a tight, professional look.
- **Micro-Copy**: Features use `tracking-widest` and `uppercase` for a polished "technical" look.

## 4. Interaction Patterns
- **Glassmorphism**: Headers use `bg-white/80` and `backdrop-blur-md` for a premium layered effect.
- **Micro-Animations**: 
  - Buttons use `hover:-translate-y-0.5` for tactile feedback.
  - Progress bars use `ease-in-out` transitions over `700ms` for smooth mastery feedback.
  - Active zones (like `PDFUpload`) use `duration-300` scale transitions.
- **Zoom Control**: Placed at the bottom-right of the sandbox to avoid obscuring mission headers, utilizing a high-contrast glassmorphism pill.

## 5. Sidebar Layout Pattern
The simulation environment enforces a **Sidebar-First** layout:
- **Left Panel (320px)**: Dedicated to "Simulation Controls" (sliders, toggles, configuration).
- **Right Panel (Fluid)**: Main visualization canvas.
- **Background**: Integrated dark theme (`#0B0F1A`) with teal accents to create an immersive, game-like experience.

---

## Component Guidelines
Incoming developers should use the following utility patterns for new cards:
`className="bg-white rounded-2xl shadow-card border border-slate-100"`
