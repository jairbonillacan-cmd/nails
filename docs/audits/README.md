# Auditorías Competitivas con REA (AgendaPro MX & Cal.com v7)

Archivo completo de investigación de producto, UX/UI, capturas y código frontend extraído con **REA** para complementar `nails`.

## Informes Completos (con Capturas Embebidas)
- **AgendaPro MX (`agendapro.com/mx`, `app.agendapro.com` y `*.site.agendapro.com/mx`):** [agendapro_rea_audit.md](./agendapro/agendapro_rea_audit.md)
  - Capturas PNG: [`agendapro/screenshots/`](./agendapro/screenshots/) (19 archivos)
  - Páginas públicas auditadas en JSON: [`agendapro/code/public_pages/`](./agendapro/code/public_pages/) (24 archivos)
  - Scripts JS/RSC exportados con REA y manifiestos SHA-256 (`landing`, CDN, `/mx/planes`, `app.agendapro.com` `root-config`, `*.site.agendapro.com`): [`agendapro/code/rea_exported_scripts.tar.gz`](./agendapro/code/rea_exported_scripts.tar.gz) (2.54 MB)
- **Cal.com v7 (`cal.com`, `cal.com/discover`, Booker en vivo y `app.cal.com`):** [calcom_rea_audit.md](./calcom/calcom_rea_audit.md)
  - Capturas PNG: [`calcom/screenshots/`](./calcom/screenshots/) (17 archivos)
  - Sistema de diseño CSS (8 hojas, 807 tokens semánticos): [`calcom/code/css/`](./calcom/code/css/)
  - Chunks autenticados de `app.cal.com` (33 archivos JS): [`calcom/code/auth_chunks/`](./calcom/code/auth_chunks/)
  - Extractos legibles de mecánicas de código: [`booker_mechanics_excerpts.txt`](./calcom/code/booker_mechanics_excerpts.txt) y [`auth_chunks_analysis.txt`](./calcom/code/auth_chunks_analysis.txt)
  - Páginas públicas de features en JSON (17 archivos): [`calcom/code/feature_pages/`](./calcom/code/feature_pages/)
  - Scripts JS/RSC exportados con REA y manifiestos SHA-256 (`landing`, `app.cal.com/auth/login`, Booker en vivo `cal.com/rick`): [`calcom/code/rea_exported_scripts.tar.gz`](./calcom/code/rea_exported_scripts.tar.gz) (3.36 MB)

## Bundle Canónico de Evidencia REA
- [`rea-evidence/rea_full_evidence_bundle.json.gz`](./rea-evidence/rea_full_evidence_bundle.json.gz) — **69 registros canónicos REA** (superset lossless que contiene el 100% de las evidencias de AgendaPro Fase 1 + Fase 2 + Cal.com Fase 1 + Fase 2; comprimido con gzip de 67.24 MB a 14.95 MB).
  - Para descomprimirlo: `gzip -dk docs/audits/rea-evidence/rea_full_evidence_bundle.json.gz`
  - Para extraer los scripts REA: `tar -xzf docs/audits/agendapro/code/rea_exported_scripts.tar.gz` / `tar -xzf docs/audits/calcom/code/rea_exported_scripts.tar.gz`

## Blueprints Ejecutivos para `nails`
- [../plan/agendapro-competitive-audit.md](../plan/agendapro-competitive-audit.md)
- [../plan/calcom-ux-audit.md](../plan/calcom-ux-audit.md)
- [../plan/super_mejoras.md](../plan/super_mejoras.md)
