# AGENTS.md

Project-specific guidance for AI coding agents.

<!-- ASTRYX:START -->
Astryx v0.7.17 · 174 components
CLI: run every command as `npx astryx <cmd>` (shown below as `astryx ...`).

SETUP (once, in app entry e.g. main.tsx) — without these, components render unstyled:
  import "@astryxdesign/core/reset.css";
  import "@astryxdesign/core/astryx.css";

WORKFLOW — start every page from a template, never from scratch:
1. `astryx build "<idea>"` — names the template to scaffold from and the parts it lacks.
2. `astryx template <name> <path>` — scaffold it; keep its frame, gap and padding; replace the content.
3. `astryx component <Name>` to read props before using one; `astryx template <Block>` prints a block example to read for a part it lacks. Astryx names differ from other libraries: buttons, badges, tokens and tabs take their text in `label` (Text, Heading and Link take children), booleans start with `is` or `has` (`isOpen`, `isDisabled`), and every input takes `value` and `onChange`.
Changing an existing page? Keep it: skip step 2 and add components inside its sections; read a block example when it helps.
Before you deliver a build, run `astryx doctor --built <dir>`; don't deliver it if it fails.

RULES:
- No <div> — components handle all layout and spacing.
- Read `astryx docs layout` before changing a template's frame.
- Dense data = rows (Table, List/Item), not Card-wrapped lists. Badge = counts only.
- Style with component props first, then tokens (var(--color-*|--spacing-*|--radius-*)). No raw hex/px. No StyleX/Tailwind compiler here — don't use xstyle/utility classes directly. Some templates use StyleX and need a compiler plugin; see `astryx docs styling-overview`.
- THEMES: palettes and custom colors go through the theme, never :root overrides; so does a denser or roomier app (`editor set <name> spacing tight`), never gap and padding changes page by page. A change to one kind of part (the sidebar, its selected item, the gaps in a form) is a theme change too, not props on one page: `editor how "<ask>"` names the `set … --on <part>` line. No app yet: `astryx experimental theme preview app <dir>` makes a starter app that shows the theme. To make or change a theme (colors, fonts, corners, spacing, a look from a picture), prefer the experimental theme editor over hand-written theme files: `astryx experimental theme editor new <name> --like neutral`, then `editor set <name> <thing> <value>` or `editor how "<what you want>"`; wire it with `astryx theme add <name>`; after each change look at it with `astryx experimental theme editor show <name> --png` (takes pictures of real components) and open the PNGs it writes; a theme change is not done until you have looked at the pictures. In code, extend an imported theme to customize it; `theme eject <slug>` only forks source. See `astryx docs theme`.
- SELF-CHECK: re-read the file; replace any raw <div>/<span>, imported .css/@apply, or hardcoded #hex/px with the component or a token.

`astryx help` lists every command. Key ones beyond the workflow:
  search "<query>"   find any component / hook / doc / template
  discover <words>   integrations you could add
  docs <topic>       getting-started, principles, tokens, theme … (`astryx docs` lists all)
  docs cli           commands and API reference
  docs authoring     build an integration package, and every field it holds
  upgrade --from <old version> --apply   run after a dependency bump
To remove this block, run `astryx init --remove-agents`, which removes it from the agent files at the project root and in the folder you run it in; from any other file it leaves, delete everything from ASTRYX:START to ASTRYX:END.
<!-- ASTRYX:END -->

## Engineering Standards ("All Code Is Slop (Except Mine)")

- **Herramientas y Skills obligatorias:** Todo entorno y agente IA que trabaje en este repo debe tener instalados obligatoriamente:
  1. **Astryx de Meta** (`@astryxdesign/core`, `@stylexjs/stylex`, `@astryxdesign/theme-neutral`, `@astryxdesign/cli` + `npx @astryxdesign/cli init`).
  2. **Cloudflare `security-audit`** (`https://github.com/cloudflare/security-audit-skill` -> `npx skills add https://github.com/cloudflare/security-audit-skill --skill security-audit --global`) para seguridad en APIs, autenticación, webhooks y fronteras de confianza.
  3. **Google Chrome `modern-web-guidance`** (`https://developer.chrome.com/docs/modern-web-guidance?hl=es-419` -> `npx skills add https://github.com/GoogleChrome/modern-web-guidance --skill modern-web-guidance --global`) para estándares web modernos, accesibilidad y rendimiento (respetando siempre las reglas de Astryx del repo).
- **Gatekeeper obligatorio:** Ninguna tarea o feature se declara terminada si `npm run verify` no pasa con **0 errores y 0 warnings** (`typecheck` + `guardrails` + `deadcode` + `test` + `doctor` + `build`), acompañado de verificación real en navegador para cambios de UI guiada por `docs/feature-map.md`.
- **Guardrails mecánicos (`scripts/check-guardrails.mjs` + `oxlint`):**
  - Cero comentarios en `src/**` (única excepción: `// INVARIANT:` auditado cuando una restricción de negocio no puede expresarse en tipos).
  - Prohibido `useEffect` y `setTimeout` en `src/app/**` y `src/components/**`; los efectos de infraestructura viven únicamente en `src/lib/hooks/`.
  - Prohibidos `<div>`/`<span>` crudos y valores `#hex`/`px` inline en `src/app/**` y `src/components/**` (usar Astryx, tokens y `src/lib/theme-presets.ts`).
  - Prohibido `any`, `as any`, `as unknown as`, `@ts-ignore` y `@ts-expect-error`.
  - Fronteras de dependencias: el dominio puro (`src/lib/availability/**`, `types.ts`, `format.ts`, `ics.ts`) no importa React, Next, Supabase, repositorios ni integraciones; `src/components/**` no importa `repositories/`, `integrations/` ni `auth/`.
- **Error-Driven System Hardening:** Cada bug o error repetido se corrige primero en el sistema (tipos/diseño -> regla en `scripts/check-guardrails.mjs` -> property test en `fast-check`), nunca agregando advertencias en prosa ni comentarios en el código.
- **Foundational Thinking & Subtract Before You Add:** Define tipos y contratos Zod antes de construir UI; simplifica y elimina código muerto (`npm run deadcode`) antes de agregar nuevas capas.


<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
