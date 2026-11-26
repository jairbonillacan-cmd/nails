import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_FROM = 'LAIKONA NAILS <citas@laikona.devand.net>';
const DEFAULT_REPLY_TO = 'jairbonillacan@gmail.com';
const DEFAULT_SITE_URL = 'https://laikona.devand.net';

const BRAND_BASE = 'https://laikona.devand.net/brand';
const LOGO_BLACK_ENGRAVED_URL = `${BRAND_BASE}/email-logo-black-engraved.png`;
const LOGO_WHITE_URL = `${BRAND_BASE}/email-wordmark-white.png`;
const STROKE_CEREZA_URL = `${BRAND_BASE}/email-stroke-cereza.png`;
const STROKE_ROSE_URL = `${BRAND_BASE}/email-stroke-rose.png`;
const CHERRIES_DECOR_URL = `${BRAND_BASE}/email-cherries-mark.png`;
const CHERRIES_ROSE_URL = `${BRAND_BASE}/email-cherries-rose.png`;
const SET_LACA_URL = `${BRAND_BASE}/email-set-laca.jpg`;
const SET_CHERRY_URL = `${BRAND_BASE}/email-set-cherry.jpg`;

const COVERS = {
  spei: `${BRAND_BASE}/email-cover-spei.jpg`,
  confirmed: `${BRAND_BASE}/email-cover-confirmed.jpg`,
  reminder24h: `${BRAND_BASE}/email-cover-24h.jpg`,
  reminder2h: `${BRAND_BASE}/email-cover-2h.jpg`,
  rescheduled: `${BRAND_BASE}/email-cover-rescheduled.jpg`,
  canceled: `${BRAND_BASE}/email-cover-canceled.jpg`,
  touchup: `${BRAND_BASE}/email-cover-touchup.jpg`,
  waitlist: `${BRAND_BASE}/email-cover-waitlist.jpg`,
  otp: `${BRAND_BASE}/email-cover-otp.jpg`,
  salonAlert: `${BRAND_BASE}/email-cover-salon-alert.jpg`,
  retention: `${BRAND_BASE}/email-cover-retention.jpg`,
};

const SERIF = "'Source Serif 4', Georgia, 'Times New Roman', serif";
const SANS = "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

const C = {
  canvas: '#F5EFEF',
  paper: '#FFFFFF',
  slip: '#FAF6F6',
  ink: '#181314',
  body: '#4A3F42',
  muted: '#857478',
  cereza: '#8B1E2B',
  hairline: '#EAE0E1',
  hairlineStrong: '#D7C6C9',
  white: '#FFFFFF',
};

function buildDarkModeRules(prefix = '') {
  const s = (sel) => (prefix ? `${prefix} ${sel}` : sel);
  return `
      ${s('.dm-canvas')} { background-color: #100D0E !important; }
      ${s('.dm-paper')} { background-color: #171314 !important; border-color: #2C2225 !important; }
      ${s('.dm-slip')} { background-color: #201A1C !important; border-color: #362A2D !important; }
      ${s('.dm-border')} { border-color: #2E2427 !important; }
      ${s('.dm-border-ink')} { border-color: #4E3E43 !important; }
      ${s('.dm-border-accent')} { border-color: #E57A89 !important; }
      ${s('.dm-ink')} { color: #FAF5F5 !important; }
      ${s('.dm-body')} { color: #D8CCD0 !important; }
      ${s('.dm-muted')} { color: #A69599 !important; }
      ${s('.dm-accent')} { color: #E57A89 !important; }
      ${s('.dm-link')} { color: #E57A89 !important; border-bottom-color: #6B3641 !important; }
      ${s('.dm-cta-cherry')} { background-color: #9E2434 !important; }
      ${s('.dm-cta-cherry a')} { color: #FFFFFF !important; }
      ${s('.dm-cta-ink')} { background-color: #FAF5F5 !important; }
      ${s('.dm-cta-ink a')} { color: #181314 !important; }
      ${s('.lk-only-light')} { display: none !important; max-height: 0 !important; overflow: hidden !important; }
      ${s('.lk-only-dark')} { display: block !important; max-height: none !important; overflow: visible !important; }`;
}

function renderFloatingOfficialLogo({ width = 128, align = 'center' } = {}) {
  const margin = align === 'center' ? 'margin:0 auto;' : 'margin:0;';
  return `<a href="{{{SITE_URL}}}" style="text-decoration:none;border:0;display:inline-block;">
                <img class="lk-only-light" src="${LOGO_BLACK_ENGRAVED_URL}" alt="LAIKONA NAILS BY KARLA" width="${width}" style="display:block;width:${width}px;max-width:100%;height:auto;border:0;${margin}" />
                <img class="lk-only-dark" src="${LOGO_WHITE_URL}" alt="LAIKONA NAILS BY KARLA" width="${width}" style="display:none;max-height:0;overflow:hidden;mso-hide:all;width:${width}px;max-width:100%;height:auto;border:0;${margin}" />
              </a>`;
}

function renderAdaptiveStroke({ width = 126, align = 'left', marginBottom = 18 } = {}) {
  const margin = align === 'center' ? `margin:0 auto ${marginBottom}px;` : `margin:0 0 ${marginBottom}px;`;
  return `<img class="lk-only-light" src="${STROKE_CEREZA_URL}" alt="" width="${width}" style="display:block;width:${width}px;max-width:44%;height:auto;border:0;${margin}" />
              <img class="lk-only-dark" src="${STROKE_ROSE_URL}" alt="" width="${width}" style="display:none;max-height:0;overflow:hidden;mso-hide:all;width:${width}px;max-width:44%;height:auto;border:0;${margin}" />`;
}

function renderAdaptiveCherries({ width = 22, height = 26 } = {}) {
  return `<img class="lk-only-light" src="${CHERRIES_DECOR_URL}" alt="" width="${width}" height="${height}" style="display:block;width:${width}px;height:${height}px;border:0;opacity:0.85;" />
              <img class="lk-only-dark" src="${CHERRIES_ROSE_URL}" alt="" width="${width}" height="${height}" style="display:none;max-height:0;overflow:hidden;mso-hide:all;width:${width}px;height:${height}px;border:0;opacity:0.9;" />`;
}

function renderEditorialLedger(rows, { highlightLast = false, marginTop = 28 } = {}) {
  const trs = rows
    .map(([label, value], i) => {
      const isFirst = i === 0;
      const isLast = i === rows.length - 1;
      const topCss = isFirst ? `border-top:1px solid ${C.ink};` : '';
      const topClass = isFirst ? ' dm-border-ink' : '';
      const isHighlight = highlightLast && isLast;
      const valStyle = isHighlight
        ? `font-family:${SERIF};font-size:19px;font-weight:500;color:${C.cereza};`
        : `font-family:${SANS};font-size:14.5px;font-weight:500;color:${C.ink};`;
      const valClass = isHighlight ? 'dm-accent' : 'dm-ink';
      return `<tr>
                  <td class="lk-row-label dm-muted dm-border${topClass}" style="${topCss}border-bottom:1px solid ${C.hairline};padding:13px 12px 13px 0;font-family:${SANS};font-size:10px;font-weight:500;letter-spacing:0.18em;text-transform:uppercase;color:${C.muted};width:38%;vertical-align:top;">
                    ${label}
                  </td>
                  <td align="right" class="lk-row-val ${valClass} dm-border${topClass}" style="${topCss}border-bottom:1px solid ${C.hairline};padding:13px 0;${valStyle}line-height:1.45;vertical-align:top;font-variant-numeric:tabular-nums;">
                    ${value}
                  </td>
                </tr>`;
    })
    .join('\n');

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:${marginTop}px;">
                ${trs}
              </table>`;
}

function renderStandardEditorialEmail({
  preheader,
  coverUrl,
  coverAlt,
  metaLeft,
  metaRight,
  accentRight = true,
  headline,
  align = 'left',
  showStroke = true,
  bodyHtml,
  primaryCta,
  ctaTone = 'cherry',
  secondaryLink = null,
  footnoteHtml = '',
  compactFooter = false,
}) {
  const rightColor = accentRight ? C.cereza : C.muted;
  const rightClass = accentRight ? 'dm-accent' : 'dm-muted';
  const isCentered = align === 'center';
  const bodyAlignAttr = isCentered ? ' align="center"' : '';
  const isInkCta = ctaTone === 'obsidian';
  const ctaBg = isInkCta ? C.ink : C.cereza;
  const ctaDarkCls = isInkCta ? 'dm-cta-ink gmail-lock-ink' : 'dm-cta-cherry gmail-lock-cherry';

  const strokeHtml = showStroke
    ? renderAdaptiveStroke({ width: 124, align: isCentered ? 'center' : 'left', marginBottom: 18 })
    : '';

  const ctaHtml = primaryCta
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:34px;">
                <tr>
                  <td align="center" bgcolor="${ctaBg}" class="${ctaDarkCls}" style="background-color:${ctaBg};border-radius:999px;">
                    <a href="${primaryCta.href}" style="display:block;padding:16px 28px;font-family:${SANS};font-size:13.5px;font-weight:600;letter-spacing:0.04em;line-height:1.2;color:${C.white};text-decoration:none;text-align:center;border-radius:999px;">
                      <span class="gmail-blend-screen"><span class="gmail-blend-difference">${primaryCta.label}</span></span>
                    </a>
                  </td>
                </tr>
              </table>`
    : '';

  const secondaryHtml = secondaryLink
    ? `<p class="dm-body" style="margin:18px 0 0;text-align:center;font-family:${SANS};font-size:13px;line-height:1.5;color:${C.body};">
                <a href="${secondaryLink.href}" class="dm-link" style="color:${C.body};text-decoration:none;border-bottom:1px solid ${C.hairlineStrong};padding-bottom:2px;">${secondaryLink.label}</a>
              </p>`
    : '';

  const noteHtml = footnoteHtml
    ? `<p class="dm-muted" style="margin:24px 0 0;font-family:${SANS};font-size:12px;line-height:1.7;color:${C.muted};text-align:center;">${footnoteHtml}</p>`
    : '';

  const footerHtml = compactFooter
    ? `<tr>
            <td class="lk-pad dm-paper dm-border" align="center" bgcolor="${C.paper}" style="background-color:${C.paper};border-top:1px solid ${C.hairline};padding:26px 44px 30px;">
              <div style="margin-bottom:10px;">
                ${renderFloatingOfficialLogo({ width: 112, align: 'center' })}
              </div>
              <p class="dm-muted" style="margin:0;font-family:${SANS};font-size:11.5px;line-height:1.6;color:${C.muted};">
                {{{ADDRESS}}} &nbsp;<span class="dm-accent" style="color:${C.cereza};">&#10047;</span>&nbsp;
                <a href="{{{SITE_URL}}}" class="dm-muted" style="color:${C.muted};text-decoration:none;">{{{SITE_URL}}}</a>
              </p>
            </td>
          </tr>`
    : `<tr>
            <td class="lk-pad dm-paper dm-border" align="center" bgcolor="${C.paper}" style="background-color:${C.paper};border-top:1px solid ${C.hairline};padding:30px 44px 36px;">
              <div style="margin-bottom:14px;">
                ${renderFloatingOfficialLogo({ width: 128, align: 'center' })}
              </div>
              <p class="dm-body" style="margin:0;font-family:${SANS};font-size:12.5px;line-height:1.6;color:${C.body};">
                {{{ADDRESS}}}
              </p>
              <p class="dm-muted" style="margin:4px 0 0;font-family:${SANS};font-size:11.5px;line-height:1.5;color:${C.muted};font-variant-numeric:tabular-nums;">
                Lunes a sábado &middot; 10:00 a 6:00 &middot; Solo con cita
              </p>
              <p class="dm-muted" style="margin:14px 0 0;font-family:${SANS};font-size:11.5px;letter-spacing:0.04em;color:${C.muted};">
                <span class="dm-accent" style="color:${C.cereza};font-weight:600;">{{{INSTAGRAM_HANDLE}}}</span>
                &nbsp;&nbsp;<span class="dm-accent" style="color:${C.cereza};">&#10047;</span>&nbsp;&nbsp;
                <a href="{{{SITE_URL}}}" class="dm-muted dm-border" style="color:${C.muted};text-decoration:none;border-bottom:1px solid ${C.hairline};padding-bottom:1px;">{{{SITE_URL}}}</a>
              </p>
            </td>
          </tr>`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title>${headline}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,500;1,8..60,400&display=swap');
    :root { color-scheme: light dark; supported-color-schemes: light dark; }
    @media (prefers-color-scheme: dark) {${buildDarkModeRules('')}
    }
    ${buildDarkModeRules('[data-ogsc]')}
    ${buildDarkModeRules('html.lk-force-dark')}
    u + .body .gmail-lock-cherry { background-image: linear-gradient(#8B1E2B, #8B1E2B) !important; }
    u + .body .gmail-lock-ink { background-image: linear-gradient(#181314, #181314) !important; }
    u + .body .gmail-blend-screen { background: #000000; mix-blend-mode: screen; display: inline-block; }
    u + .body .gmail-blend-difference { background: #000000; mix-blend-mode: difference; display: inline-block; color: #FFFFFF !important; }
    @media only screen and (max-width:600px) {
      .lk-outer { padding: 14px 8px 28px !important; }
      .lk-pad { padding-left: 24px !important; padding-right: 24px !important; }
      .lk-h1 { font-size: 30px !important; line-height: 1.08 !important; }
      .lk-time-xl { font-size: 40px !important; }
      .lk-otp { font-size: 32px !important; letter-spacing: 8px !important; padding-left: 8px !important; }
      .lk-row-label { width: 42% !important; font-size: 9.5px !important; }
      .lk-row-val { font-size: 13.5px !important; }
      .lk-kpi-val { font-size: 23px !important; }
    }
  </style>
</head>
<body class="body dm-canvas" style="margin:0;padding:0;background-color:${C.canvas};-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${preheader}&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.canvas}" class="lk-outer dm-canvas" style="background-color:${C.canvas};padding:34px 12px 46px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.paper}" class="dm-paper" style="max-width:580px;background-color:${C.paper};border:1px solid ${C.hairline};border-radius:6px;overflow:hidden;">
          <tr>
            <td style="padding:0;line-height:0;font-size:0;">
              <a href="{{{SITE_URL}}}" style="display:block;text-decoration:none;border:0;">
                <img src="${coverUrl}" alt="${coverAlt}" width="580" style="display:block;width:100%;height:auto;border:0;" />
              </a>
            </td>
          </tr>
          <tr>
            <td class="lk-pad dm-paper" bgcolor="${C.paper}" style="background-color:${C.paper};padding:0 44px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="dm-border" style="border-bottom:1px solid ${C.hairline};">
                <tr>
                  <td class="dm-muted" style="padding:13px 0;font-family:${SANS};font-size:9.5px;font-weight:500;letter-spacing:0.20em;text-transform:uppercase;color:${C.muted};">
                    ${metaLeft}
                  </td>
                  <td align="right" class="${rightClass}" style="padding:13px 0;font-family:${SANS};font-size:9.5px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:${rightColor};white-space:nowrap;font-variant-numeric:tabular-nums;">
                    ${metaRight}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="lk-pad dm-paper"${bodyAlignAttr} bgcolor="${C.paper}" style="background-color:${C.paper};padding:34px 44px 40px;">
              <h1 class="lk-h1 dm-ink" style="margin:0 0 10px;font-family:${SERIF};font-size:36px;font-weight:400;line-height:1.08;letter-spacing:-0.02em;color:${C.ink};">
                ${headline}
              </h1>
              ${strokeHtml}
              ${bodyHtml}
              ${ctaHtml}
              ${secondaryHtml}
              ${noteHtml}
            </td>
          </tr>
          ${footerHtml}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

const COMMON_FOOTER_VARS = [
  { key: 'SALON_NAME', type: 'string', fallback: 'LAIKONA NAILS' },
  { key: 'ADDRESS', type: 'string', fallback: 'Blvd. Héroes del 5 de Mayo, Puebla, Pue.' },
  { key: 'INSTAGRAM_HANDLE', type: 'string', fallback: '@laikona.nailsss' },
  { key: 'SITE_URL', type: 'string', fallback: DEFAULT_SITE_URL },
];

export const RESEND_TEMPLATES = [
  {
    alias: 'laikona-booking-pending-spei',
    name: 'LAIKONA · Cita recibida (Anticipo SPEI)',
    subject: 'Apartamos tu cita {{{BOOKING_CODE}}} · Anticipo SPEI',
    variables: [
      { key: 'CLIENT_NAME', type: 'string', fallback: 'Sofía' },
      { key: 'BOOKING_CODE', type: 'string', fallback: 'NL-DEMO01' },
      { key: 'SERVICE_NAME', type: 'string', fallback: 'Rubber' },
      { key: 'STAFF_NAME', type: 'string', fallback: 'Karla' },
      { key: 'DATE_LABEL', type: 'string', fallback: 'viernes 27 de noviembre' },
      { key: 'TIME_LABEL', type: 'string', fallback: '10:00 a.m.' },
      { key: 'TOTAL_LABEL', type: 'string', fallback: '$350 MXN' },
      { key: 'DEPOSIT_LABEL', type: 'string', fallback: '$200 MXN' },
      { key: 'BANK_NAME', type: 'string', fallback: 'Mercado Pago' },
      { key: 'BENEFICIARY', type: 'string', fallback: 'Karla Patricia Carrillo Rodríguez' },
      { key: 'CLABE', type: 'string', fallback: '7229 6901 3959 779869' },
      { key: 'MANAGE_URL', type: 'string', fallback: `${DEFAULT_SITE_URL}/mis-citas` },
      { key: 'WHATSAPP_URL', type: 'string', fallback: `${DEFAULT_SITE_URL}/links` },
      ...COMMON_FOOTER_VARS,
    ],
    html: renderStandardEditorialEmail({
      preheader: 'Apartamos tu espacio {{{BOOKING_CODE}}}. Realiza tu anticipo SPEI para confirmarlo.',
      coverUrl: COVERS.spei,
      coverAlt: 'LAIKONA NAILS BY KARLA · Set rubí y negro',
      metaLeft: 'ANTICIPO SPEI &middot; PUEBLA',
      metaRight: 'N&ordm; {{{BOOKING_CODE}}}',
      headline: 'Apartamos tu espacio.',
      bodyHtml: `
              <p class="dm-body" style="margin:0;font-family:${SANS};font-size:15px;line-height:1.78;color:${C.body};">
                Hola <strong class="dm-ink" style="color:${C.ink};">{{{CLIENT_NAME}}}</strong>, reservamos provisionalmente tu horario en el estudio. Para dejar tu cita confirmada, realiza tu anticipo por transferencia SPEI y sube tu comprobante desde tu enlace personal.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.slip}" class="dm-slip dm-border-accent" style="margin-top:26px;background-color:${C.slip};border-top:1.5px solid ${C.cereza};border-bottom:1.5px solid ${C.cereza};">
                <tr>
                  <td style="padding:22px 24px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td valign="middle" class="dm-accent" style="font-family:${SANS};font-size:10px;font-weight:600;letter-spacing:0.20em;text-transform:uppercase;color:${C.cereza};">
                          Transferencia SPEI
                        </td>
                        <td align="right" valign="middle" class="dm-ink" style="font-family:${SERIF};font-size:24px;font-weight:400;color:${C.ink};font-variant-numeric:tabular-nums;">
                          {{{DEPOSIT_LABEL}}}
                        </td>
                      </tr>
                    </table>
                    <p class="dm-body" style="margin:14px 0 4px;font-family:${SANS};font-size:13.5px;line-height:1.6;color:${C.body};">
                      <span class="dm-muted" style="color:${C.muted};">Banco:</span> &nbsp;{{{BANK_NAME}}}
                    </p>
                    <p class="dm-body" style="margin:0 0 14px;font-family:${SANS};font-size:13.5px;line-height:1.6;color:${C.body};">
                      <span class="dm-muted" style="color:${C.muted};">Titular:</span> &nbsp;{{{BENEFICIARY}}}
                    </p>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="dm-border" style="border-top:1px solid ${C.hairline};">
                      <tr>
                        <td style="padding-top:14px;">
                          <p class="dm-muted" style="margin:0 0 4px;font-family:${SANS};font-size:9.5px;font-weight:500;letter-spacing:0.18em;text-transform:uppercase;color:${C.muted};">
                            CLABE interbancaria
                          </p>
                          <p class="dm-accent" style="margin:0;font-family:${MONO};font-size:16.5px;font-weight:600;letter-spacing:0.08em;color:${C.cereza};">
                            {{{CLABE}}}
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              ${renderEditorialLedger(
                [
                  ['Servicio', '{{{SERVICE_NAME}}}'],
                  ['Artista', '{{{STAFF_NAME}}}'],
                  ['Fecha', '{{{DATE_LABEL}}}'],
                  ['Horario', '{{{TIME_LABEL}}}'],
                  ['Total estimado', '{{{TOTAL_LABEL}}}'],
                ],
                { highlightLast: true, marginTop: 26 },
              )}`,
      primaryCta: {
        label: 'Subir comprobante y ver mi cita',
        href: '{{{MANAGE_URL}}}',
      },
      secondaryLink: {
        label: '¿Prefieres enviarlo por WhatsApp?',
        href: '{{{WHATSAPP_URL}}}',
      },
      footnoteHtml:
        'Adjuntamos tu invitación de calendario (.ics) lista para guardar en un clic.',
    }),
    text: `LAIKONA NAILS BY KARLA · PUEBLA
SOLICITUD RECIBIDA · Nº {{{BOOKING_CODE}}}

Apartamos tu espacio.

Hola {{{CLIENT_NAME}}},
Reservamos provisionalmente tu horario en el estudio. Para dejar tu cita confirmada, realiza tu anticipo SPEI y sube tu comprobante desde tu enlace personal.

TRANSFERENCIA SPEI — {{{DEPOSIT_LABEL}}}
Banco: {{{BANK_NAME}}}
Titular: {{{BENEFICIARY}}}
CLABE: {{{CLABE}}}

DETALLES
Servicio: {{{SERVICE_NAME}}}
Artista: {{{STAFF_NAME}}}
Fecha: {{{DATE_LABEL}}}
Horario: {{{TIME_LABEL}}}
Total estimado: {{{TOTAL_LABEL}}}

Subir comprobante y ver mi cita: {{{MANAGE_URL}}}
WhatsApp del estudio: {{{WHATSAPP_URL}}}

Adjuntamos tu invitación de calendario (.ics).

{{{SALON_NAME}}}
{{{ADDRESS}}}
{{{INSTAGRAM_HANDLE}}} · {{{SITE_URL}}}`,
  },

  {
    alias: 'laikona-booking-confirmed',
    name: 'LAIKONA · Cita confirmada',
    subject: 'Confirmamos tu cita {{{BOOKING_CODE}}} · {{{SALON_NAME}}}',
    variables: [
      { key: 'CLIENT_NAME', type: 'string', fallback: 'Sofía' },
      { key: 'BOOKING_CODE', type: 'string', fallback: 'NL-DEMO01' },
      { key: 'SERVICE_NAME', type: 'string', fallback: 'Rubber' },
      { key: 'STAFF_NAME', type: 'string', fallback: 'Karla' },
      { key: 'DATE_LABEL', type: 'string', fallback: 'viernes 27 de noviembre' },
      { key: 'TIME_LABEL', type: 'string', fallback: '10:00 a.m.' },
      { key: 'TOTAL_LABEL', type: 'string', fallback: '$350 MXN' },
      { key: 'MANAGE_URL', type: 'string', fallback: `${DEFAULT_SITE_URL}/mis-citas` },
      { key: 'WHATSAPP_URL', type: 'string', fallback: `${DEFAULT_SITE_URL}/links` },
      ...COMMON_FOOTER_VARS,
    ],
    html: renderStandardEditorialEmail({
      preheader: 'Tu cita {{{BOOKING_CODE}}} de {{{SERVICE_NAME}}} con {{{STAFF_NAME}}} está confirmada.',
      coverUrl: COVERS.confirmed,
      coverAlt: 'LAIKONA NAILS BY KARLA · Manicure editorial cereza',
      metaLeft: 'CITA CONFIRMADA &middot; PUEBLA',
      metaRight: 'N&ordm; {{{BOOKING_CODE}}}',
      headline: 'Tu lugar está listo.',
      bodyHtml: `
              <p class="dm-body" style="margin:0;font-family:${SANS};font-size:15px;line-height:1.78;color:${C.body};">
                Hola <strong class="dm-ink" style="color:${C.ink};">{{{CLIENT_NAME}}}</strong>, qué gusto recibirte pronto. Tu cita en <strong class="dm-ink" style="color:${C.ink};">{{{SALON_NAME}}}</strong> ha quedado confirmada y preparada especialmente para ti.
              </p>
              ${renderEditorialLedger(
                [
                  ['Fecha', '{{{DATE_LABEL}}}'],
                  ['Horario', '{{{TIME_LABEL}}}'],
                  ['Servicio', '{{{SERVICE_NAME}}}'],
                  ['Artista', '{{{STAFF_NAME}}}'],
                  ['Total del servicio', '{{{TOTAL_LABEL}}}'],
                ],
                { highlightLast: true, marginTop: 28 },
              )}
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;">
                <tr>
                  <td class="dm-ink" style="padding-bottom:10px;font-family:${SANS};font-size:10px;font-weight:600;letter-spacing:0.20em;text-transform:uppercase;color:${C.ink};">
                    Para tu visita
                  </td>
                </tr>
                <tr>
                  <td class="dm-body" style="padding:5px 0;font-family:${SANS};font-size:13.5px;line-height:1.65;color:${C.body};">
                    <span class="dm-accent" style="color:${C.cereza};font-family:${SERIF};font-style:italic;padding-right:10px;">01</span>
                    Llega 5 a 10 minutos antes para comenzar con calma.
                  </td>
                </tr>
                <tr>
                  <td class="dm-body" style="padding:5px 0;font-family:${SANS};font-size:13.5px;line-height:1.65;color:${C.body};">
                    <span class="dm-accent" style="color:${C.cereza};font-family:${SERIF};font-style:italic;padding-right:10px;">02</span>
                    Cuidamos cada set con 15 minutos máximos de tolerancia.
                  </td>
                </tr>
                <tr>
                  <td class="dm-body" style="padding:5px 0;font-family:${SANS};font-size:13.5px;line-height:1.65;color:${C.body};">
                    <span class="dm-accent" style="color:${C.cereza};font-family:${SERIF};font-style:italic;padding-right:10px;">03</span>
                    Si ya tienes foto de inspiración, tráela lista para revisarla juntas.
                  </td>
                </tr>
              </table>`,
      primaryCta: {
        label: 'Ver detalles o reagendar',
        href: '{{{MANAGE_URL}}}',
      },
      secondaryLink: {
        label: 'Escribir por WhatsApp al estudio',
        href: '{{{WHATSAPP_URL}}}',
      },
      footnoteHtml:
        'Adjuntamos tu invitación de calendario (.ics) para guardarla con un clic.',
    }),
    text: `LAIKONA NAILS BY KARLA · PUEBLA
CITA CONFIRMADA · Nº {{{BOOKING_CODE}}}

Tu lugar está listo.

Hola {{{CLIENT_NAME}}},
Tu cita en {{{SALON_NAME}}} ha quedado confirmada.

Fecha: {{{DATE_LABEL}}}
Horario: {{{TIME_LABEL}}}
Servicio: {{{SERVICE_NAME}}}
Artista: {{{STAFF_NAME}}}
Total: {{{TOTAL_LABEL}}}

PARA TU VISITA
01 · Llega 5 a 10 minutos antes.
02 · Tolerancia máxima de 15 minutos.
03 · Trae tu foto de inspiración si tienes una idea en mente.

Ver detalles o reagendar: {{{MANAGE_URL}}}
WhatsApp: {{{WHATSAPP_URL}}}

Adjuntamos tu archivo de calendario (.ics).

{{{SALON_NAME}}}
{{{ADDRESS}}}
{{{INSTAGRAM_HANDLE}}} · {{{SITE_URL}}}`,
  },

  {
    alias: 'laikona-booking-reminder-24h',
    name: 'LAIKONA · Recordatorio 24 horas antes',
    subject: 'Mañana te esperamos · {{{TIME_LABEL}}} en {{{SALON_NAME}}}',
    variables: [
      { key: 'CLIENT_NAME', type: 'string', fallback: 'Sofía' },
      { key: 'BOOKING_CODE', type: 'string', fallback: 'NL-DEMO01' },
      { key: 'SERVICE_NAME', type: 'string', fallback: 'Rubber' },
      { key: 'STAFF_NAME', type: 'string', fallback: 'Karla' },
      { key: 'DATE_LABEL', type: 'string', fallback: 'mañana viernes 27 de noviembre' },
      { key: 'TIME_LABEL', type: 'string', fallback: '10:00 a.m.' },
      { key: 'MANAGE_URL', type: 'string', fallback: `${DEFAULT_SITE_URL}/mis-citas` },
      { key: 'WHATSAPP_URL', type: 'string', fallback: `${DEFAULT_SITE_URL}/links` },
      ...COMMON_FOOTER_VARS,
    ],
    html: renderStandardEditorialEmail({
      preheader: 'Mañana tienes cita de {{{SERVICE_NAME}}} a las {{{TIME_LABEL}}} con {{{STAFF_NAME}}}.',
      coverUrl: COVERS.reminder24h,
      coverAlt: 'LAIKONA NAILS BY KARLA · Set floral french rosa',
      metaLeft: 'RECORDATORIO &middot; 24 HORAS',
      metaRight: 'N&ordm; {{{BOOKING_CODE}}}',
      headline: 'Mañana te esperamos.',
      bodyHtml: `
              <p class="dm-body" style="margin:0;font-family:${SANS};font-size:15px;line-height:1.78;color:${C.body};">
                Hola <strong class="dm-ink" style="color:${C.ink};">{{{CLIENT_NAME}}}</strong>, te recordamos los detalles de tu visita de mañana en el estudio. Si necesitas mover tu horario, puedes hacerlo directo desde tu enlace personal.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="dm-border-ink" style="margin-top:26px;border-top:1px solid ${C.ink};border-bottom:1px solid ${C.hairline};">
                <tr>
                  <td style="padding:20px 0;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td valign="middle">
                          <p class="dm-muted" style="margin:0 0 4px;font-family:${SANS};font-size:9.5px;font-weight:600;letter-spacing:0.20em;text-transform:uppercase;color:${C.muted};">
                            Horario reservado
                          </p>
                          <p class="dm-accent" style="margin:0;font-family:${SERIF};font-size:34px;font-weight:400;line-height:1.05;color:${C.cereza};font-variant-numeric:tabular-nums;">
                            {{{TIME_LABEL}}}
                          </p>
                          <p class="dm-ink" style="margin:6px 0 0;font-family:${SANS};font-size:14px;font-weight:500;color:${C.ink};">
                            {{{DATE_LABEL}}}
                          </p>
                        </td>
                        <td align="right" valign="middle" width="34">
                          ${renderAdaptiveCherries({ width: 22, height: 26 })}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              ${renderEditorialLedger(
                [
                  ['Servicio', '{{{SERVICE_NAME}}}'],
                  ['Artista', '{{{STAFF_NAME}}}'],
                  ['Ubicación', '{{{ADDRESS}}}'],
                ],
                { marginTop: 0 },
              )}`,
      primaryCta: {
        label: 'Gestionar mi cita',
        href: '{{{MANAGE_URL}}}',
      },
      secondaryLink: {
        label: 'Avisar por WhatsApp',
        href: '{{{WHATSAPP_URL}}}',
      },
      footnoteHtml:
        'Te agradecemos avisar cualquier cambio con anticipación para cuidar tu anticipo.',
    }),
    text: `LAIKONA NAILS BY KARLA · PUEBLA
RECORDATORIO 24 H · Nº {{{BOOKING_CODE}}}

Mañana te esperamos.

Hola {{{CLIENT_NAME}}},
Detalles de tu cita de mañana:
Horario: {{{TIME_LABEL}}}
Fecha: {{{DATE_LABEL}}}
Servicio: {{{SERVICE_NAME}}}
Artista: {{{STAFF_NAME}}}
Ubicación: {{{ADDRESS}}}

Gestionar mi cita: {{{MANAGE_URL}}}
WhatsApp: {{{WHATSAPP_URL}}}

{{{SALON_NAME}}} · {{{INSTAGRAM_HANDLE}}} · {{{SITE_URL}}}`,
  },

  {
    alias: 'laikona-booking-reminder-2h',
    name: 'LAIKONA · Recordatorio 2 horas antes',
    subject: 'Hoy te esperamos a las {{{TIME_LABEL}}} · {{{SALON_NAME}}}',
    variables: [
      { key: 'CLIENT_NAME', type: 'string', fallback: 'Sofía' },
      { key: 'BOOKING_CODE', type: 'string', fallback: 'NL-DEMO01' },
      { key: 'SERVICE_NAME', type: 'string', fallback: 'Rubber' },
      { key: 'STAFF_NAME', type: 'string', fallback: 'Karla' },
      { key: 'TIME_LABEL', type: 'string', fallback: '10:00 a.m.' },
      { key: 'MANAGE_URL', type: 'string', fallback: `${DEFAULT_SITE_URL}/mis-citas` },
      { key: 'WHATSAPP_URL', type: 'string', fallback: `${DEFAULT_SITE_URL}/links` },
      ...COMMON_FOOTER_VARS,
    ],
    html: renderStandardEditorialEmail({
      preheader: 'Hoy es tu cita a las {{{TIME_LABEL}}} con {{{STAFF_NAME}}} en {{{SALON_NAME}}}.',
      coverUrl: COVERS.reminder2h,
      coverAlt: 'LAIKONA NAILS BY KARLA · Set vino metalizado chrome',
      metaLeft: 'HOY EN EL ESTUDIO',
      metaRight: 'N&ordm; {{{BOOKING_CODE}}}',
      headline: 'Nos vemos muy pronto.',
      align: 'center',
      bodyHtml: `
              <p class="dm-body" style="margin:0;font-family:${SANS};font-size:15px;line-height:1.74;color:${C.body};">
                Hola <strong class="dm-ink" style="color:${C.ink};">{{{CLIENT_NAME}}}</strong>, tu mesa está por quedar lista. Te esperamos hoy en {{{SALON_NAME}}}:
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="dm-border-ink" style="margin-top:26px;border-top:1px solid ${C.ink};border-bottom:1px solid ${C.hairline};">
                <tr>
                  <td align="center" style="padding:28px 12px;">
                    <p class="dm-muted" style="margin:0 0 8px;font-family:${SANS};font-size:9.5px;font-weight:600;letter-spacing:0.22em;text-transform:uppercase;color:${C.muted};">
                      Horario de hoy
                    </p>
                    <p class="lk-time-xl dm-accent" style="margin:0;font-family:${SERIF};font-size:48px;font-weight:400;line-height:1;letter-spacing:-0.02em;color:${C.cereza};font-variant-numeric:tabular-nums;">
                      {{{TIME_LABEL}}}
                    </p>
                    <p class="dm-ink" style="margin:14px 0 0;font-family:${SANS};font-size:15px;font-weight:500;color:${C.ink};">
                      {{{SERVICE_NAME}}} &nbsp;&middot;&nbsp; con {{{STAFF_NAME}}}
                    </p>
                    <p class="dm-muted" style="margin:6px 0 0;font-family:${SANS};font-size:13px;line-height:1.55;color:${C.muted};">
                      {{{ADDRESS}}}
                    </p>
                  </td>
                </tr>
              </table>`,
      primaryCta: {
        label: 'Abrir ubicación y detalles',
        href: '{{{MANAGE_URL}}}',
      },
      secondaryLink: {
        label: '¿Vienes en camino? Escríbenos por WhatsApp',
        href: '{{{WHATSAPP_URL}}}',
      },
      compactFooter: true,
    }),
    text: `LAIKONA NAILS BY KARLA · PUEBLA
HOY EN EL ESTUDIO · Nº {{{BOOKING_CODE}}}

Nos vemos muy pronto — {{{TIME_LABEL}}}

Hola {{{CLIENT_NAME}}},
Te esperamos hoy en {{{SALON_NAME}}}:
Horario: {{{TIME_LABEL}}}
Servicio: {{{SERVICE_NAME}}}
Artista: {{{STAFF_NAME}}}
Dirección: {{{ADDRESS}}}

Abrir ubicación y detalles: {{{MANAGE_URL}}}
WhatsApp: {{{WHATSAPP_URL}}}

{{{SALON_NAME}}} · {{{INSTAGRAM_HANDLE}}} · {{{SITE_URL}}}`,
  },

  {
    alias: 'laikona-booking-rescheduled',
    name: 'LAIKONA · Cita reagendada',
    subject: 'Nuevo horario confirmado {{{BOOKING_CODE}}} · {{{DATE_LABEL}}}',
    variables: [
      { key: 'CLIENT_NAME', type: 'string', fallback: 'Sofía' },
      { key: 'BOOKING_CODE', type: 'string', fallback: 'NL-DEMO01' },
      { key: 'SERVICE_NAME', type: 'string', fallback: 'Rubber' },
      { key: 'STAFF_NAME', type: 'string', fallback: 'Karla' },
      { key: 'DATE_LABEL', type: 'string', fallback: 'sábado 28 de noviembre' },
      { key: 'TIME_LABEL', type: 'string', fallback: '1:30 p.m.' },
      { key: 'MANAGE_URL', type: 'string', fallback: `${DEFAULT_SITE_URL}/mis-citas` },
      { key: 'WHATSAPP_URL', type: 'string', fallback: `${DEFAULT_SITE_URL}/links` },
      ...COMMON_FOOTER_VARS,
    ],
    html: renderStandardEditorialEmail({
      preheader: 'Actualizamos tu cita {{{BOOKING_CODE}}} al {{{DATE_LABEL}}} a las {{{TIME_LABEL}}}.',
      coverUrl: COVERS.rescheduled,
      coverAlt: 'LAIKONA NAILS BY KARLA · Set almendra cristal y dorado',
      metaLeft: 'CAMBIO DE HORARIO',
      metaRight: 'N&ordm; {{{BOOKING_CODE}}}',
      headline: 'Actualizamos tu cita.',
      align: 'center',
      bodyHtml: `
              <p class="dm-body" style="margin:0;font-family:${SANS};font-size:15px;line-height:1.76;color:${C.body};">
                Hola <strong class="dm-ink" style="color:${C.ink};">{{{CLIENT_NAME}}}</strong>, guardamos tu nueva fecha sin problema. Así queda confirmada tu próxima visita:
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.slip}" class="dm-slip dm-border-accent" style="margin-top:26px;background-color:${C.slip};border-top:1px solid ${C.cereza};border-bottom:1px solid ${C.cereza};">
                <tr>
                  <td align="center" style="padding:24px 18px;">
                    <p class="dm-muted" style="margin:0 0 6px;font-family:${SANS};font-size:9.5px;font-weight:600;letter-spacing:0.20em;text-transform:uppercase;color:${C.muted};">
                      Nuevo horario confirmado
                    </p>
                    <p class="dm-ink" style="margin:0;font-family:${SERIF};font-size:26px;font-weight:400;line-height:1.2;color:${C.ink};font-variant-numeric:tabular-nums;">
                      {{{DATE_LABEL}}}
                    </p>
                    <p class="dm-accent" style="margin:4px 0 0;font-family:${SERIF};font-size:24px;font-weight:500;line-height:1.1;color:${C.cereza};font-variant-numeric:tabular-nums;">
                      {{{TIME_LABEL}}}
                    </p>
                  </td>
                </tr>
              </table>
              ${renderEditorialLedger(
                [
                  ['Servicio', '{{{SERVICE_NAME}}}'],
                  ['Artista', '{{{STAFF_NAME}}}'],
                ],
                { marginTop: 22 },
              )}`,
      primaryCta: {
        label: 'Ver mi cita actualizada',
        href: '{{{MANAGE_URL}}}',
      },
      secondaryLink: {
        label: 'Escribir por WhatsApp al estudio',
        href: '{{{WHATSAPP_URL}}}',
      },
      footnoteHtml:
        'Adjuntamos el archivo .ics actualizado para reemplazar la fecha anterior en tu calendario.',
    }),
    text: `LAIKONA NAILS BY KARLA · PUEBLA
CAMBIO DE HORARIO · Nº {{{BOOKING_CODE}}}

Actualizamos tu cita.

Hola {{{CLIENT_NAME}}},
Nueva fecha: {{{DATE_LABEL}}}
Nuevo horario: {{{TIME_LABEL}}}
Servicio: {{{SERVICE_NAME}}}
Artista: {{{STAFF_NAME}}}

Ver mi cita actualizada: {{{MANAGE_URL}}}
WhatsApp: {{{WHATSAPP_URL}}}

Adjuntamos tu archivo .ics actualizado.

{{{SALON_NAME}}} · {{{ADDRESS}}} · {{{SITE_URL}}}`,
  },

  {
    alias: 'laikona-booking-canceled',
    name: 'LAIKONA · Cita cancelada',
    subject: 'Cancelación de cita {{{BOOKING_CODE}}} · {{{SALON_NAME}}}',
    variables: [
      { key: 'CLIENT_NAME', type: 'string', fallback: 'Sofía' },
      { key: 'BOOKING_CODE', type: 'string', fallback: 'NL-DEMO01' },
      { key: 'SERVICE_NAME', type: 'string', fallback: 'Rubber' },
      { key: 'STAFF_NAME', type: 'string', fallback: 'Karla' },
      { key: 'DATE_LABEL', type: 'string', fallback: 'viernes 27 de noviembre' },
      { key: 'TIME_LABEL', type: 'string', fallback: '10:00 a.m.' },
      { key: 'CANCELLATION_NOTE', type: 'string', fallback: 'Cancelación registrada desde la plataforma.' },
      { key: 'BOOKING_URL', type: 'string', fallback: `${DEFAULT_SITE_URL}/reservar` },
      { key: 'WHATSAPP_URL', type: 'string', fallback: `${DEFAULT_SITE_URL}/links` },
      ...COMMON_FOOTER_VARS,
    ],
    html: renderStandardEditorialEmail({
      preheader: 'Confirmamos la cancelación de tu cita {{{BOOKING_CODE}}} en {{{SALON_NAME}}}.',
      coverUrl: COVERS.canceled,
      coverAlt: 'LAIKONA NAILS BY KARLA · Set verde oliva oscuro aura',
      metaLeft: 'CONFIRMACIÓN DE CANCELACIÓN',
      metaRight: 'N&ordm; {{{BOOKING_CODE}}}',
      accentRight: false,
      headline: 'Tu cita ha sido cancelada.',
      showStroke: false,
      bodyHtml: `
              <p class="dm-body" style="margin:6px 0 0;font-family:${SANS};font-size:15px;line-height:1.78;color:${C.body};">
                Hola <strong class="dm-ink" style="color:${C.ink};">{{{CLIENT_NAME}}}</strong>, liberamos tu espacio en agenda tal como se solicitó. Cuando desees volver a agendar, estaremos encantadas de recibirte.
              </p>
              ${renderEditorialLedger(
                [
                  ['Servicio', '{{{SERVICE_NAME}}}'],
                  ['Artista', '{{{STAFF_NAME}}}'],
                  ['Fecha original', '{{{DATE_LABEL}}} · {{{TIME_LABEL}}}'],
                  ['Observación', '{{{CANCELLATION_NOTE}}}'],
                ],
                { marginTop: 28 },
              )}`,
      primaryCta: {
        label: 'Agendar una nueva fecha',
        href: '{{{BOOKING_URL}}}',
      },
      ctaTone: 'obsidian',
      secondaryLink: {
        label: '¿Necesitas ayuda? Escríbenos por WhatsApp',
        href: '{{{WHATSAPP_URL}}}',
      },
    }),
    text: `LAIKONA NAILS BY KARLA · PUEBLA
CANCELACIÓN · Nº {{{BOOKING_CODE}}}

Tu cita ha sido cancelada.

Hola {{{CLIENT_NAME}}},
Liberamos tu horario en agenda:
Servicio: {{{SERVICE_NAME}}}
Artista: {{{STAFF_NAME}}}
Fecha original: {{{DATE_LABEL}}} · {{{TIME_LABEL}}}
Observación: {{{CANCELLATION_NOTE}}}

Agendar una nueva fecha: {{{BOOKING_URL}}}
WhatsApp: {{{WHATSAPP_URL}}}

{{{SALON_NAME}}} · {{{ADDRESS}}} · {{{SITE_URL}}}`,
  },

  {
    alias: 'laikona-touchup-reminder',
    name: 'LAIKONA · Recordatorio de retoque (3 semanas)',
    subject: 'Tres semanas después · ¿Lista para tu retoque?',
    variables: [
      { key: 'CLIENT_NAME', type: 'string', fallback: 'Sofía' },
      { key: 'SERVICE_NAME', type: 'string', fallback: 'Rubber' },
      { key: 'STAFF_NAME', type: 'string', fallback: 'Karla' },
      { key: 'BOOKING_URL', type: 'string', fallback: `${DEFAULT_SITE_URL}/reservar` },
      { key: 'WHATSAPP_URL', type: 'string', fallback: `${DEFAULT_SITE_URL}/links` },
      ...COMMON_FOOTER_VARS,
    ],
    html: renderStandardEditorialEmail({
      preheader: 'Ya casi cumplen 3 semanas tus uñas. Aparta tu retoque en {{{SALON_NAME}}}.',
      coverUrl: COVERS.touchup,
      coverAlt: 'LAIKONA NAILS BY KARLA · Set flor coral 3D',
      metaLeft: 'RITUAL DE MANTENIMIENTO',
      metaRight: '3 SEMANAS',
      headline: 'Tres semanas después.',
      align: 'center',
      bodyHtml: `
              <p class="dm-body" style="margin:0;font-family:${SANS};font-size:15px;line-height:1.8;color:${C.body};">
                Hola <strong class="dm-ink" style="color:${C.ink};">{{{CLIENT_NAME}}}</strong>, ya casi cumplen tres semanas desde tu último servicio de <strong class="dm-ink" style="color:${C.ink};">{{{SERVICE_NAME}}}</strong> con {{{STAFF_NAME}}}. Renovar tu set a tiempo mantiene tu uña natural fuerte, ligera y con estructura impecable.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:26px;">
                <tr>
                  <td width="48.5%" style="line-height:0;font-size:0;">
                    <img src="${SET_LACA_URL}" alt="Set rojo laca y dorado en LAIKONA NAILS" width="238" style="display:block;width:100%;height:auto;border:0;border-radius:4px;" />
                  </td>
                  <td width="3%">&nbsp;</td>
                  <td width="48.5%" style="line-height:0;font-size:0;">
                    <img src="${SET_CHERRY_URL}" alt="Set editorial cereza en LAIKONA NAILS" width="238" style="display:block;width:100%;height:auto;border:0;border-radius:4px;" />
                  </td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="dm-border" style="margin-top:26px;border-top:1px solid ${C.hairline};border-bottom:1px solid ${C.hairline};">
                <tr>
                  <td align="center" style="padding:18px 8px;">
                    <p class="dm-ink" style="margin:0;font-family:${SERIF};font-style:italic;font-size:18px;line-height:1.55;color:${C.ink};">
                      “El secreto de unas uñas que siempre se ven impecables está en el retoque a tiempo.”
                    </p>
                  </td>
                </tr>
              </table>`,
      primaryCta: {
        label: 'Apartar mi retoque en línea',
        href: '{{{BOOKING_URL}}}',
      },
      secondaryLink: {
        label: 'Consultar horarios por WhatsApp',
        href: '{{{WHATSAPP_URL}}}',
      },
    }),
    text: `LAIKONA NAILS BY KARLA · PUEBLA
RITUAL DE MANTENIMIENTO · 3 SEMANAS

Tres semanas después.

Hola {{{CLIENT_NAME}}},
Ya casi cumplen tres semanas desde tu último servicio de {{{SERVICE_NAME}}} con {{{STAFF_NAME}}}. Renovar tu set a tiempo mantiene tu uña natural fuerte, ligera y con estructura impecable.

Apartar mi retoque en línea: {{{BOOKING_URL}}}
WhatsApp: {{{WHATSAPP_URL}}}

{{{SALON_NAME}}} · {{{ADDRESS}}} · {{{INSTAGRAM_HANDLE}}} · {{{SITE_URL}}}`,
  },

  {
    alias: 'laikona-waitlist-offer',
    name: 'LAIKONA · Espacio prioritario lista de espera',
    subject: 'Se liberó un espacio en {{{SALON_NAME}}} · {{{DATE_LABEL}}}',
    variables: [
      { key: 'CLIENT_NAME', type: 'string', fallback: 'Sofía' },
      { key: 'SERVICE_NAME', type: 'string', fallback: 'Rubber' },
      { key: 'STAFF_NAME', type: 'string', fallback: 'Karla' },
      { key: 'DATE_LABEL', type: 'string', fallback: 'viernes 27 de noviembre' },
      { key: 'TIME_LABEL', type: 'string', fallback: '4:00 p.m.' },
      { key: 'TTL_MINUTES', type: 'string', fallback: '30' },
      { key: 'OFFER_URL', type: 'string', fallback: `${DEFAULT_SITE_URL}/reservar` },
      ...COMMON_FOOTER_VARS,
    ],
    html: renderStandardEditorialEmail({
      preheader: 'Tienes {{{TTL_MINUTES}}} minutos de prioridad para apartar el espacio del {{{DATE_LABEL}}}.',
      coverUrl: COVERS.waitlist,
      coverAlt: 'LAIKONA NAILS BY KARLA · Set rojo laca y dorado',
      metaLeft: 'LISTA DE ESPERA &middot; ACCESO PRIVADO',
      metaRight: 'PRIORIDAD &middot; {{{TTL_MINUTES}}} MIN',
      headline: 'Se abrió un lugar para ti.',
      bodyHtml: `
              <p class="dm-body" style="margin:0;font-family:${SANS};font-size:15px;line-height:1.78;color:${C.body};">
                Hola <strong class="dm-ink" style="color:${C.ink};">{{{CLIENT_NAME}}}</strong>, acaba de liberarse un espacio que coincide con tu solicitud en el estudio. Lo reservamos de forma prioritaria para ti durante los próximos <strong class="dm-accent" style="color:${C.cereza};">{{{TTL_MINUTES}}} minutos</strong>.
              </p>
              ${renderEditorialLedger(
                [
                  ['Servicio', '{{{SERVICE_NAME}}}'],
                  ['Artista', '{{{STAFF_NAME}}}'],
                  ['Fecha', '{{{DATE_LABEL}}}'],
                  ['Horario libre', '{{{TIME_LABEL}}}'],
                ],
                { highlightLast: true, marginTop: 28 },
              )}`,
      primaryCta: {
        label: 'Tomar este horario ahora',
        href: '{{{OFFER_URL}}}',
      },
      footnoteHtml:
        'Al concluir los {{{TTL_MINUTES}}} minutos el espacio se libera automáticamente para la siguiente persona en lista.',
    }),
    text: `LAIKONA NAILS BY KARLA · PUEBLA
LISTA DE ESPERA · PRIORIDAD {{{TTL_MINUTES}}} MIN

Se abrió un lugar para ti.

Hola {{{CLIENT_NAME}}},
Se liberó un espacio en {{{SALON_NAME}}}:
Servicio: {{{SERVICE_NAME}}}
Artista: {{{STAFF_NAME}}}
Fecha: {{{DATE_LABEL}}}
Horario: {{{TIME_LABEL}}}

Tomar este horario ahora: {{{OFFER_URL}}}

{{{SALON_NAME}}} · {{{ADDRESS}}} · {{{SITE_URL}}}`,
  },

  {
    alias: 'laikona-client-otp',
    name: 'LAIKONA · Código de acceso Mis Citas (OTP)',
    subject: 'Tu código de acceso: {{{OTP_CODE}}} · {{{SALON_NAME}}}',
    variables: [
      { key: 'CLIENT_NAME', type: 'string', fallback: 'Sofía' },
      { key: 'OTP_CODE', type: 'string', fallback: '482910' },
      { key: 'EXPIRES_MINUTES', type: 'string', fallback: '5' },
      { key: 'PORTAL_URL', type: 'string', fallback: `${DEFAULT_SITE_URL}/mis-citas` },
      ...COMMON_FOOTER_VARS,
    ],
    html: renderStandardEditorialEmail({
      preheader: 'Tu código privado de {{{SALON_NAME}}} es {{{OTP_CODE}}}. Válido por {{{EXPIRES_MINUTES}}} minutos.',
      coverUrl: COVERS.otp,
      coverAlt: 'LAIKONA NAILS BY KARLA · Set azul joya',
      metaLeft: 'PORTAL MIS CITAS',
      metaRight: 'ACCESO PRIVADO',
      headline: 'Tu código de verificación.',
      align: 'center',
      bodyHtml: `
              <p class="dm-body" style="margin:0;font-family:${SANS};font-size:15px;line-height:1.75;color:${C.body};">
                Hola <strong class="dm-ink" style="color:${C.ink};">{{{CLIENT_NAME}}}</strong>, ingresa este código de un solo uso para consultar tus próximas citas, historial y sellos de fidelidad:
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="dm-border-ink" style="margin-top:26px;border-top:1px solid ${C.ink};border-bottom:1px solid ${C.hairline};">
                <tr>
                  <td align="center" style="padding:28px 12px;">
                    <p class="lk-otp dm-accent" style="margin:0;font-family:${MONO};font-size:40px;font-weight:500;letter-spacing:12px;color:${C.cereza};padding-left:12px;line-height:1.1;">
                      {{{OTP_CODE}}}
                    </p>
                    <p class="dm-muted" style="margin:14px 0 0;font-family:${SANS};font-size:10px;font-weight:500;letter-spacing:0.20em;text-transform:uppercase;color:${C.muted};font-variant-numeric:tabular-nums;">
                      Válido por {{{EXPIRES_MINUTES}}} minutos &nbsp;&middot;&nbsp; Uso personal
                    </p>
                  </td>
                </tr>
              </table>`,
      primaryCta: {
        label: 'Ir a Mis citas',
        href: '{{{PORTAL_URL}}}',
      },
      footnoteHtml:
        'Si no solicitaste este código, puedes ignorar este correo; nadie puede entrar sin él.',
      compactFooter: true,
    }),
    text: `LAIKONA NAILS BY KARLA · PUEBLA
PORTAL MIS CITAS · ACCESO PRIVADO

Tu código de verificación: {{{OTP_CODE}}}

Hola {{{CLIENT_NAME}}},
Ingresa este código para consultar tus citas, historial y sellos de fidelidad.
Válido por {{{EXPIRES_MINUTES}}} minutos. No lo compartas con nadie.

Ir a Mis citas: {{{PORTAL_URL}}}

{{{SALON_NAME}}} · {{{ADDRESS}}} · {{{SITE_URL}}}`,
  },

  {
    alias: 'laikona-salon-alert',
    name: 'LAIKONA · Aviso interno al estudio',
    subject: 'Despacho estudio: {{{ALERT_HEADING}}} ({{{BOOKING_CODE}}})',
    variables: [
      { key: 'ALERT_BADGE', type: 'string', fallback: 'Cambio en agenda' },
      { key: 'ALERT_HEADING', type: 'string', fallback: 'Reagenda registrada por clienta' },
      { key: 'ALERT_DETAIL', type: 'string', fallback: 'La clienta actualizó su cita desde su enlace personal.' },
      { key: 'BOOKING_CODE', type: 'string', fallback: 'NL-DEMO01' },
      { key: 'CLIENT_NAME', type: 'string', fallback: 'Sofía' },
      { key: 'CLIENT_PHONE', type: 'string', fallback: '+522221234567' },
      { key: 'SERVICE_NAME', type: 'string', fallback: 'Rubber' },
      { key: 'STAFF_NAME', type: 'string', fallback: 'Karla' },
      { key: 'DATE_LABEL', type: 'string', fallback: 'viernes 27 de noviembre' },
      { key: 'TIME_LABEL', type: 'string', fallback: '10:00 a.m.' },
      { key: 'ADMIN_URL', type: 'string', fallback: `${DEFAULT_SITE_URL}/admin/citas` },
      ...COMMON_FOOTER_VARS,
    ],
    html: renderStandardEditorialEmail({
      preheader: '{{{ALERT_HEADING}}} ({{{BOOKING_CODE}}}) — {{{CLIENT_NAME}}}.',
      coverUrl: COVERS.salonAlert,
      coverAlt: 'LAIKONA NAILS BY KARLA · Despacho de estudio',
      metaLeft: 'PANEL ESTUDIO &middot; {{{ALERT_BADGE}}}',
      metaRight: 'N&ordm; {{{BOOKING_CODE}}}',
      accentRight: false,
      headline: '{{{ALERT_HEADING}}}',
      showStroke: false,
      bodyHtml: `
              <p class="dm-body" style="margin:6px 0 0;font-family:${SANS};font-size:15px;line-height:1.78;color:${C.body};">
                {{{ALERT_DETAIL}}}
              </p>
              ${renderEditorialLedger(
                [
                  ['Clienta', '{{{CLIENT_NAME}}}'],
                  ['WhatsApp', '{{{CLIENT_PHONE}}}'],
                  ['Servicio', '{{{SERVICE_NAME}}}'],
                  ['Artista', '{{{STAFF_NAME}}}'],
                  ['Fecha y hora', '{{{DATE_LABEL}}} · {{{TIME_LABEL}}}'],
                ],
                { marginTop: 28 },
              )}`,
      primaryCta: {
        label: 'Abrir agenda en Admin',
        href: '{{{ADMIN_URL}}}',
      },
      ctaTone: 'obsidian',
      compactFooter: true,
    }),
    text: `LAIKONA NAILS · DESPACHO ADMINISTRATIVO
{{{ALERT_BADGE}}} · Nº {{{BOOKING_CODE}}}

{{{ALERT_HEADING}}}
{{{ALERT_DETAIL}}}

Clienta: {{{CLIENT_NAME}}} ({{{CLIENT_PHONE}}})
Servicio: {{{SERVICE_NAME}}}
Artista: {{{STAFF_NAME}}}
Fecha y hora: {{{DATE_LABEL}}} · {{{TIME_LABEL}}}

Abrir agenda en Admin: {{{ADMIN_URL}}}

{{{SALON_NAME}}} · {{{SITE_URL}}}`,
  },

  {
    alias: 'laikona-retention-warning',
    name: 'LAIKONA · Aviso de retención (30d / 7d)',
    subject: 'Respaldo contable ({{{STAGE_LABEL}}}): {{{ASSETS_COUNT}}} archivo(s) · {{{SALON_NAME}}}',
    variables: [
      { key: 'STAGE_LABEL', type: 'string', fallback: '30 días' },
      { key: 'HEADING_TEXT', type: 'string', fallback: 'Respalda tus comprobantes antes de la limpieza anual' },
      { key: 'INTRO_TEXT', type: 'string', fallback: 'Próximamente se cumplirán 12 meses desde la carga de estos archivos de comprobantes y referencias.' },
      { key: 'ASSETS_COUNT', type: 'string', fallback: '1' },
      { key: 'PROOFS_COUNT', type: 'string', fallback: '1' },
      { key: 'INSPO_COUNT', type: 'string', fallback: '0' },
      { key: 'TOTAL_SIZE', type: 'string', fallback: '245 KB' },
      { key: 'ASSETS_PREVIEW', type: 'string', fallback: 'Comprobante SPEI · proofs/ejemplo.png' },
      { key: 'CAJA_URL', type: 'string', fallback: `${DEFAULT_SITE_URL}/admin/caja?tab=anticipos` },
      ...COMMON_FOOTER_VARS,
    ],
    html: renderStandardEditorialEmail({
      preheader: 'Respalda {{{ASSETS_COUNT}}} archivo(s) antes de su purga automática en {{{STAGE_LABEL}}}.',
      coverUrl: COVERS.retention,
      coverAlt: 'LAIKONA NAILS BY KARLA · Respaldo contable',
      metaLeft: 'RESPALDO CONTABLE',
      metaRight: 'VENTANA &middot; {{{STAGE_LABEL}}}',
      headline: '{{{HEADING_TEXT}}}',
      showStroke: false,
      bodyHtml: `
              <p class="dm-body" style="margin:6px 0 0;font-family:${SANS};font-size:15px;line-height:1.78;color:${C.body};">
                {{{INTRO_TEXT}}}
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="dm-border-ink" style="margin-top:28px;border-top:1px solid ${C.ink};border-bottom:1px solid ${C.hairline};">
                <tr>
                  <td width="33%" align="center" class="dm-border" style="padding:18px 6px;border-right:1px solid ${C.hairline};">
                    <p class="dm-muted" style="margin:0 0 4px;font-family:${SANS};font-size:9px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:${C.muted};">Archivos</p>
                    <p class="lk-kpi-val dm-ink" style="margin:0;font-family:${SERIF};font-size:28px;font-weight:400;line-height:1;color:${C.ink};font-variant-numeric:tabular-nums;">{{{ASSETS_COUNT}}}</p>
                  </td>
                  <td width="33%" align="center" class="dm-border" style="padding:18px 6px;border-right:1px solid ${C.hairline};">
                    <p class="dm-muted" style="margin:0 0 4px;font-family:${SANS};font-size:9px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:${C.muted};">SPEI</p>
                    <p class="lk-kpi-val dm-accent" style="margin:0;font-family:${SERIF};font-size:28px;font-weight:400;line-height:1;color:${C.cereza};font-variant-numeric:tabular-nums;">{{{PROOFS_COUNT}}}</p>
                  </td>
                  <td width="34%" align="center" style="padding:18px 6px;">
                    <p class="dm-muted" style="margin:0 0 4px;font-family:${SANS};font-size:9px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:${C.muted};">Peso</p>
                    <p class="lk-kpi-val dm-ink" style="margin:0;font-family:${SERIF};font-size:24px;font-weight:400;line-height:1.15;color:${C.ink};font-variant-numeric:tabular-nums;">{{{TOTAL_SIZE}}}</p>
                  </td>
                </tr>
              </table>
              <p class="dm-muted" style="margin:10px 0 0;font-family:${SANS};font-size:12px;color:${C.muted};text-align:center;font-variant-numeric:tabular-nums;">
                Incluye {{{PROOFS_COUNT}}} comprobante(s) SPEI y {{{INSPO_COUNT}}} foto(s) de referencia.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.slip}" class="dm-slip dm-border" style="margin-top:22px;background-color:${C.slip};border-top:1px solid ${C.hairline};border-bottom:1px solid ${C.hairline};">
                <tr>
                  <td style="padding:16px 18px;">
                    <p class="dm-muted" style="margin:0 0 8px;font-family:${SANS};font-size:9.5px;font-weight:600;letter-spacing:0.20em;text-transform:uppercase;color:${C.muted};">
                      Vista previa del lote
                    </p>
                    <p class="dm-body" style="margin:0;font-family:${MONO};font-size:12px;line-height:1.7;color:${C.body};white-space:pre-line;">
                      {{{ASSETS_PREVIEW}}}
                    </p>
                  </td>
                </tr>
              </table>`,
      primaryCta: {
        label: 'Abrir Caja y respaldar comprobantes',
        href: '{{{CAJA_URL}}}',
      },
      ctaTone: 'obsidian',
      footnoteHtml:
        'Tu historial de citas, pagos, reportes de caja y datos de clientas permanecen intactos; únicamente se depuran las imágenes mayores a 12 meses.',
      compactFooter: true,
    }),
    text: `LAIKONA NAILS · RESPALDO CONTABLE ({{{STAGE_LABEL}}})
{{{HEADING_TEXT}}}

{{{INTRO_TEXT}}}

Archivos en lote: {{{ASSETS_COUNT}}}
Comprobantes SPEI: {{{PROOFS_COUNT}}}
Fotos de referencia: {{{INSPO_COUNT}}}
Peso total: {{{TOTAL_SIZE}}}

VISTA PREVIA
{{{ASSETS_PREVIEW}}}

Abrir Caja y respaldar comprobantes: {{{CAJA_URL}}}

Tu historial de citas, pagos, reportes de caja y datos de clientas permanecen intactos.

{{{SALON_NAME}}} · {{{ADDRESS}}} · {{{SITE_URL}}}`,
  },
];

let cachedCliPath = null;

function resolveResendCliPath() {
  if (cachedCliPath && fs.existsSync(cachedCliPath)) return cachedCliPath;

  const candidateRoots = [];
  if (process.env.LOCALAPPDATA) {
    candidateRoots.push(path.join(process.env.LOCALAPPDATA, 'npm-cache', '_npx'));
  }
  candidateRoots.push(path.join(os.homedir(), '.npm', '_npx'));

  for (const root of candidateRoots) {
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root)) {
      const candidate = path.join(root, entry, 'node_modules', 'resend-cli', 'dist', 'cli.cjs');
      if (fs.existsSync(candidate)) {
        cachedCliPath = candidate;
        return candidate;
      }
    }
  }
  return null;
}

function runResendCli(args) {
  const cliPath = resolveResendCliPath();
  let stdout;
  if (cliPath) {
    stdout = execFileSync(process.execPath, [cliPath, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } else {
    stdout = execFileSync('npx', ['-y', 'resend-cli@latest', ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }
  return JSON.parse(stdout.trim());
}

function buildVarArgs(variables) {
  const args = [];
  for (const v of variables) {
    args.push('--var', `${v.key}:${v.type}:${String(v.fallback)}`);
  }
  return args;
}

function syncAllTemplates() {
  const existingRes = runResendCli(['templates', 'list', '--limit', '100', '--json']);
  const existingByAlias = new Map();
  const existingByName = new Map();
  for (const item of existingRes.data ?? []) {
    if (item.alias) existingByAlias.set(item.alias, item);
    if (item.name) existingByName.set(item.name, item);
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'laikona-resend-tpl-'));
  const summary = [];

  try {
    for (const tpl of RESEND_TEMPLATES) {
      const htmlPath = path.join(tmpDir, `${tpl.alias}.html`);
      const textPath = path.join(tmpDir, `${tpl.alias}.txt`);
      fs.writeFileSync(htmlPath, tpl.html, 'utf8');
      fs.writeFileSync(textPath, tpl.text, 'utf8');

      const existing = existingByAlias.get(tpl.alias) ?? existingByName.get(tpl.name);
      const commonArgs = [
        '--alias',
        tpl.alias,
        '--name',
        tpl.name,
        '--from',
        DEFAULT_FROM,
        '--reply-to',
        DEFAULT_REPLY_TO,
        '--subject',
        tpl.subject,
        '--html-file',
        htmlPath,
        '--text-file',
        textPath,
        ...buildVarArgs(tpl.variables),
        '--json',
      ];

      let id;
      let action;
      if (existing) {
        runResendCli(['templates', 'update', existing.id, ...commonArgs]);
        id = existing.id;
        action = 'updated';
      } else {
        const created = runResendCli([
          'templates',
          'create',
          ...commonArgs,
        ]);
        id = created.id;
        action = 'created';
      }

      runResendCli(['templates', 'publish', id, '--json']);
      summary.push({
        alias: tpl.alias,
        id,
        action,
        status: 'published',
        variables: tpl.variables.length,
        htmlBytes: Buffer.byteLength(tpl.html, 'utf8'),
      });
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  console.log(JSON.stringify({ ok: true, count: summary.length, templates: summary }, null, 2));
}

function renderTemplateWithFallbacks(tpl, assetBaseUrl) {
  let html = tpl.html;
  let text = tpl.text;
  let subject = tpl.subject;
  for (const v of tpl.variables) {
    const token = `{{{${v.key}}}}`;
    const val = String(v.fallback);
    html = html.split(token).join(val);
    text = text.split(token).join(val);
    subject = subject.split(token).join(val);
  }
  if (assetBaseUrl) {
    html = html.split(BRAND_BASE).join(assetBaseUrl);
  }
  return { html, text, subject };
}

function buildGalleryHtml(assetBaseUrl) {
  const logoLightSrc = assetBaseUrl
    ? `${assetBaseUrl}/email-logo-black-engraved.png`
    : LOGO_BLACK_ENGRAVED_URL;
  const logoDarkSrc = assetBaseUrl
    ? `${assetBaseUrl}/email-wordmark-white.png`
    : LOGO_WHITE_URL;

  const items = RESEND_TEMPLATES.map((tpl) => {
    const rendered = renderTemplateWithFallbacks(tpl, assetBaseUrl);
    const group =
      tpl.alias === 'laikona-salon-alert' || tpl.alias === 'laikona-retention-warning'
        ? 'admin'
        : 'client';
    return {
      alias: tpl.alias,
      name: tpl.name.replace(/^LAIKONA\s*·\s*/i, ''),
      group,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      htmlKb: (Buffer.byteLength(tpl.html, 'utf8') / 1024).toFixed(1),
      varsCount: tpl.variables.length,
    };
  });

  const safeDataJson = JSON.stringify(items).replace(/<\/script/gi, '<\\/script');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>LAIKONA NAILS · Galería Editorial de Plantillas</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,500;1,8..60,400&display=swap" rel="stylesheet" />
  <style>
    :root {
      --bg: #F5EFEF;
      --surface: #FFFFFF;
      --ink: #181314;
      --muted: #7E6C70;
      --cherry: #8B1E2B;
      --cherry-soft: #F6ECEE;
      --line: #EAE0E1;
      --chrome: #FAF6F6;
      --iframe-bg: #F5EFEF;
    }
    body.ui-dark {
      --bg: #100D0E;
      --surface: #171314;
      --ink: #FAF5F5;
      --muted: #A69599;
      --cherry: #9E2434;
      --cherry-soft: #2E191E;
      --line: #2C2225;
      --chrome: #141011;
      --iframe-bg: #100D0E;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      background: var(--bg);
      color: var(--ink);
      min-height: 100vh;
      display: grid;
      grid-template-columns: 296px 1fr;
      transition: background 180ms ease, color 180ms ease;
    }
    aside {
      background: var(--surface);
      border-right: 1px solid var(--line);
      padding: 22px 16px 32px;
      position: sticky;
      top: 0;
      height: 100vh;
      overflow-y: auto;
    }
    .brand-head {
      padding: 4px 10px 18px;
      border-bottom: 1px solid var(--line);
      margin-bottom: 14px;
    }
    .brand-logo { display: block; width: 132px; height: auto; margin-bottom: 10px; }
    .brand-logo-dark { display: none; }
    body.ui-dark .brand-logo-light { display: none; }
    body.ui-dark .brand-logo-dark { display: block; }
    .brand-title { font-family: 'Source Serif 4', Georgia, serif; font-size: 21px; font-weight: 500; letter-spacing: -0.02em; margin: 0; line-height: 1.15; }
    .brand-sub { font-size: 12px; color: var(--muted); margin: 5px 0 0; }
    .group-label { font-size: 10px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: var(--muted); padding: 14px 10px 6px; margin: 0; }
    .nav-btn { width: 100%; text-align: left; background: transparent; border: 1px solid transparent; border-radius: 10px; padding: 10px 12px; margin-bottom: 4px; cursor: pointer; display: block; transition: background 140ms ease, border-color 140ms ease; }
    .nav-btn:hover { background: var(--bg); }
    .nav-btn.active { background: var(--cherry-soft); border-color: rgba(139, 30, 43, 0.35); }
    .nav-name { display: block; font-size: 13.5px; font-weight: 600; color: var(--ink); line-height: 1.3; }
    .nav-meta { display: block; font-size: 11px; color: var(--muted); margin-top: 2px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    main { min-width: 0; display: flex; flex-direction: column; }
    .toolbar { position: sticky; top: 0; z-index: 20; background: var(--surface); border-bottom: 1px solid var(--line); padding: 14px 28px; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }
    .mail-meta { min-width: 220px; flex: 1; }
    .mail-subject { font-family: 'Source Serif 4', Georgia, serif; font-size: 19px; font-weight: 500; letter-spacing: -0.015em; margin: 0 0 3px; }
    .mail-headers { font-size: 12px; color: var(--muted); margin: 0; }
    .mail-headers strong { color: var(--ink); font-weight: 600; }
    .controls { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
    .modes { display: inline-flex; border: 1px solid var(--line); border-radius: 999px; background: var(--bg); padding: 3px; gap: 3px; }
    .mode-btn, .theme-btn { border: 0; border-radius: 999px; background: transparent; color: var(--muted); font-family: inherit; font-size: 12px; font-weight: 600; padding: 7px 12px; cursor: pointer; }
    .mode-btn.active, .theme-btn.active { background: var(--cherry); color: #fff; }
    .stage { padding: 28px; flex: 1; }
    .split { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: center; gap: 28px; }
    .device-col { display: flex; flex-direction: column; align-items: center; }
    .device-label { font-size: 10px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: var(--muted); margin: 0 0 10px; }
    .desktop-frame { width: 660px; max-width: 100%; background: var(--iframe-bg); border: 1px solid var(--line); border-radius: 14px; overflow: hidden; box-shadow: 0 20px 50px -30px rgba(0, 0, 0, 0.28); }
    .desktop-chrome { height: 32px; background: var(--chrome); border-bottom: 1px solid var(--line); display: flex; align-items: center; padding: 0 14px; gap: 6px; font-size: 11px; color: var(--muted); }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--line); }
    .mobile-bezel { width: 414px; background: #0D0A0B; border: 1px solid #2C2325; border-radius: 42px; padding: 12px; box-shadow: 0 24px 54px -24px rgba(0, 0, 0, 0.55); }
    .mobile-notch { width: 108px; height: 18px; background: #0D0A0B; border-radius: 0 0 14px 14px; margin: 0 auto 8px; }
    .mobile-screen { width: 390px; background: var(--iframe-bg); border-radius: 30px; overflow: hidden; }
    iframe.email-iframe { display: block; width: 100%; border: 0; background: var(--iframe-bg); min-height: 620px; }
    .text-card { max-width: 680px; margin: 0 auto; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 28px 32px; }
    .text-card pre { margin: 0; white-space: pre-wrap; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; line-height: 1.7; color: var(--ink); }
    .all-stack { display: flex; flex-direction: column; gap: 44px; }
    .all-block { border-top: 1px solid var(--line); padding-top: 22px; }
    .all-block-head { display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 8px; margin-bottom: 18px; }
    .all-block-head h2 { font-family: 'Source Serif 4', Georgia, serif; font-size: 24px; font-weight: 500; margin: 0; }
    .all-block-head code { font-size: 12px; color: var(--ink); background: var(--cherry-soft); border-radius: 999px; padding: 4px 10px; }
    @media (max-width: 960px) {
      body { grid-template-columns: 1fr; }
      aside { position: static; height: auto; border-right: 0; border-bottom: 1px solid var(--line); }
      .desktop-frame { width: 100%; }
      .mobile-bezel { width: 100%; max-width: 414px; }
      .mobile-screen { width: 100%; }
    }
  </style>
</head>
<body>
  <aside>
    <div class="brand-head">
      <img class="brand-logo brand-logo-light" src="${logoLightSrc}" alt="LAIKONA NAILS BY KARLA" />
      <img class="brand-logo brand-logo-dark" src="${logoDarkSrc}" alt="LAIKONA NAILS BY KARLA" />
      <h1 class="brand-title">Editorial Mail Suite</h1>
      <p class="brand-sub">11 portadas únicas de estudio · Claro, Apple &amp; Gmail iOS</p>
    </div>
    <p class="group-label">Clientas (9)</p>
    <div id="nav-client"></div>
    <p class="group-label">Estudio &amp; Admin (2)</p>
    <div id="nav-admin"></div>
  </aside>
  <main>
    <header class="toolbar">
      <div class="mail-meta">
        <p class="mail-subject" id="cur-subject"></p>
        <p class="mail-headers">
          <strong>De:</strong> LAIKONA NAILS &lt;citas@laikona.devand.net&gt; &nbsp;·&nbsp;
          <strong>Alias:</strong> <span id="cur-alias"></span> &nbsp;·&nbsp;
          <span id="cur-size"></span>
        </p>
      </div>
      <div class="controls">
        <div class="modes" role="group" aria-label="Tema">
          <button class="theme-btn active" data-theme="light">Claro</button>
          <button class="theme-btn" data-theme="dark">Oscuro (Apple)</button>
          <button class="theme-btn" data-theme="gmail-ios">Gmail iOS Oscuro</button>
        </div>
        <div class="modes" role="tablist">
          <button class="mode-btn active" data-mode="split">Desktop + Móvil</button>
          <button class="mode-btn" data-mode="desktop">Desktop</button>
          <button class="mode-btn" data-mode="mobile">Móvil</button>
          <button class="mode-btn" data-mode="text">Texto plano</button>
          <button class="mode-btn" data-mode="all">Ver las 11</button>
        </div>
      </div>
    </header>
    <section class="stage" id="stage"></section>
  </main>

  <script>
    const TEMPLATES = ${safeDataJson};
    let currentIndex = 1;
    let currentMode = 'split';
    let currentTheme = 'light';

    const navClient = document.getElementById('nav-client');
    const navAdmin = document.getElementById('nav-admin');
    const stage = document.getElementById('stage');
    const curSubject = document.getElementById('cur-subject');
    const curAlias = document.getElementById('cur-alias');
    const curSize = document.getElementById('cur-size');

    const GMAIL_IOS_SIM_CSS = '<style>' +
      'body, .dm-canvas { background-color: #161616 !important; }' +
      '.dm-paper { background-color: #202124 !important; border-color: #36373B !important; }' +
      '.dm-slip { background-color: #28292D !important; border-color: #E57A89 !important; }' +
      '.dm-border { border-color: #35363A !important; }' +
      '.dm-border-ink { border-color: #5A5C62 !important; }' +
      '.dm-border-accent { border-color: #E57A89 !important; }' +
      '.dm-ink { color: #E8EAED !important; }' +
      '.dm-body { color: #C4C7CC !important; }' +
      '.dm-muted { color: #9AA0A6 !important; }' +
      '.dm-accent, .dm-link { color: #E89AA4 !important; }' +
      '.gmail-lock-cherry { background-color: #8B1E2B !important; }' +
      '.gmail-lock-cherry a { color: #FFFFFF !important; }' +
      '.gmail-lock-ink { background-color: #181314 !important; border: 1px solid #48494E !important; }' +
      '.gmail-lock-ink a { color: #FFFFFF !important; }' +
      '</style>';

    function themedHtml(html) {
      if (currentTheme === 'dark') {
        return html.replace('<html lang="es">', '<html lang="es" class="lk-force-dark">');
      }
      const noDarkMedia = html.replace(
        '@media (prefers-color-scheme: dark)',
        '@media (prefers-color-scheme: dark) and (max-width: 0px)',
      );
      if (currentTheme === 'gmail-ios') {
        return noDarkMedia.replace('</head>', GMAIL_IOS_SIM_CSS + '</head>');
      }
      return noDarkMedia;
    }

    function autoSizeIframe(iframe) {
      const resize = () => {
        try {
          const doc = iframe.contentDocument;
          if (!doc || !doc.body) return;
          const h = Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight);
          if (h > 100) iframe.style.height = (h + 16) + 'px';
        } catch {}
      };
      iframe.addEventListener('load', () => {
        resize();
        setTimeout(resize, 350);
        setTimeout(resize, 900);
      });
    }

    function themeSuffix() {
      if (currentTheme === 'dark') return ' · Oscuro (Apple)';
      if (currentTheme === 'gmail-ios') return ' · Gmail iOS Oscuro';
      return ' · Modo Claro';
    }

    function createDesktopCol(tpl) {
      const col = document.createElement('div');
      col.className = 'device-col';
      col.innerHTML = '<p class="device-label">Desktop · 660 px' + themeSuffix() + '</p><div class="desktop-frame"><div class="desktop-chrome"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span style="margin-left:8px;">Bandeja de entrada · Gmail / Apple Mail</span></div></div>';
      const iframe = document.createElement('iframe');
      iframe.className = 'email-iframe';
      iframe.title = tpl.name + ' (Desktop)';
      iframe.srcdoc = themedHtml(tpl.html);
      autoSizeIframe(iframe);
      col.querySelector('.desktop-frame').appendChild(iframe);
      return col;
    }

    function createMobileCol(tpl) {
      const col = document.createElement('div');
      col.className = 'device-col';
      col.innerHTML = '<p class="device-label">Móvil · 390 px' + themeSuffix() + '</p><div class="mobile-bezel"><div class="mobile-notch"></div><div class="mobile-screen"></div></div>';
      const iframe = document.createElement('iframe');
      iframe.className = 'email-iframe';
      iframe.title = tpl.name + ' (Móvil)';
      iframe.srcdoc = themedHtml(tpl.html);
      autoSizeIframe(iframe);
      col.querySelector('.mobile-screen').appendChild(iframe);
      return col;
    }

    function renderNav() {
      navClient.innerHTML = '';
      navAdmin.innerHTML = '';
      TEMPLATES.forEach((tpl, idx) => {
        const btn = document.createElement('button');
        btn.className = 'nav-btn' + (idx === currentIndex && currentMode !== 'all' ? ' active' : '');
        btn.innerHTML = '<span class="nav-name">' + tpl.name + '</span><span class="nav-meta">' + tpl.alias + ' · ' + tpl.htmlKb + ' KB</span>';
        btn.onclick = () => {
          currentIndex = idx;
          if (currentMode === 'all') currentMode = 'split';
          syncModeButtons();
          renderNav();
          renderStage();
        };
        (tpl.group === 'admin' ? navAdmin : navClient).appendChild(btn);
      });
    }

    function syncModeButtons() {
      document.querySelectorAll('.mode-btn').forEach((b) => {
        b.classList.toggle('active', b.dataset.mode === currentMode);
      });
      document.querySelectorAll('.theme-btn').forEach((b) => {
        b.classList.toggle('active', b.dataset.theme === currentTheme);
      });
      document.body.classList.toggle('ui-dark', currentTheme !== 'light');
    }

    function renderStage() {
      const tpl = TEMPLATES[currentIndex];
      if (currentMode === 'all') {
        curSubject.textContent = 'Todas las plantillas (11) — Vista comparativa Desktop + Móvil';
        curAlias.textContent = 'laikona-*';
        curSize.textContent = '11 portadas editoriales';
      } else {
        curSubject.textContent = tpl.subject;
        curAlias.textContent = tpl.alias;
        curSize.textContent = tpl.htmlKb + ' KB · ' + tpl.varsCount + ' variables';
      }

      stage.innerHTML = '';

      if (currentMode === 'text') {
        const card = document.createElement('div');
        card.className = 'text-card';
        const pre = document.createElement('pre');
        pre.textContent = tpl.text;
        card.appendChild(pre);
        stage.appendChild(card);
        return;
      }

      if (currentMode === 'all') {
        const stack = document.createElement('div');
        stack.className = 'all-stack';
        TEMPLATES.forEach((item) => {
          const block = document.createElement('div');
          block.className = 'all-block';
          block.innerHTML = '<div class="all-block-head"><h2>' + item.name + '</h2><code>' + item.alias + ' · ' + item.htmlKb + ' KB</code></div>';
          const split = document.createElement('div');
          split.className = 'split';
          split.appendChild(createDesktopCol(item));
          split.appendChild(createMobileCol(item));
          block.appendChild(split);
          stack.appendChild(block);
        });
        stage.appendChild(stack);
        return;
      }

      const split = document.createElement('div');
      split.className = 'split';
      if (currentMode === 'split' || currentMode === 'desktop') {
        split.appendChild(createDesktopCol(tpl));
      }
      if (currentMode === 'split' || currentMode === 'mobile') {
        split.appendChild(createMobileCol(tpl));
      }
      stage.appendChild(split);
    }

    document.querySelectorAll('.mode-btn').forEach((btn) => {
      btn.onclick = () => {
        currentMode = btn.dataset.mode;
        syncModeButtons();
        renderNav();
        renderStage();
      };
    });

    document.querySelectorAll('.theme-btn').forEach((btn) => {
      btn.onclick = () => {
        currentTheme = btn.dataset.theme;
        syncModeButtons();
        renderStage();
      };
    });

    syncModeButtons();
    renderNav();
    renderStage();
  </script>
</body>
</html>`;
}

function serveGallery(port = 3099) {
  const brandDir = path.resolve('public/brand');
  const mimeTypes = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
  };

  const server = http.createServer((req, res) => {
    const reqUrl = new URL(req.url || '/', `http://127.0.0.1:${port}`);
    if (reqUrl.pathname.startsWith('/brand/')) {
      const fileName = path.basename(reqUrl.pathname);
      const filePath = path.join(brandDir, fileName);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(fileName).toLowerCase();
        res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
        fs.createReadStream(filePath).pipe(res);
        return;
      }
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const html = buildGalleryHtml(`http://localhost:${port}/brand`);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`LAIKONA Email Preview Gallery running at http://localhost:${port}`);
  });
}

if (process.argv.includes('--serve')) {
  const portIdx = process.argv.indexOf('--port');
  const port = portIdx !== -1 ? Number(process.argv[portIdx + 1]) || 3099 : 3099;
  serveGallery(port);
} else if (process.argv.includes('--gallery')) {
  const outIdx = process.argv.indexOf('--gallery');
  const outPath = process.argv[outIdx + 1];
  if (!outPath) throw new Error('Missing --gallery output path');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, buildGalleryHtml(null), 'utf8');
  console.log(`Wrote standalone interactive email gallery to ${outPath}`);
} else if (process.argv.includes('--preview-dir')) {
  const dirIdx = process.argv.indexOf('--preview-dir');
  const outDir = process.argv[dirIdx + 1];
  if (!outDir) throw new Error('Missing --preview-dir path');
  fs.mkdirSync(outDir, { recursive: true });
  const localAssets = process.argv.includes('--local-assets');
  const assetBase = localAssets
    ? `file:///${path.resolve('public/brand').replace(/\\/g, '/')}`
    : null;
  for (const tpl of RESEND_TEMPLATES) {
    const rendered = renderTemplateWithFallbacks(tpl, assetBase);
    fs.writeFileSync(path.join(outDir, `${tpl.alias}.html`), rendered.html, 'utf8');
  }
  console.log(`Wrote ${RESEND_TEMPLATES.length} HTML previews to ${outDir}`);
} else {
  syncAllTemplates();
}
