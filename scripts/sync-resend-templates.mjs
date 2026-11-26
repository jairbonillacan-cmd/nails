import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_FROM = 'LAIKONA NAILS <citas@laikona.devand.net>';
const DEFAULT_REPLY_TO = 'jairbonillacan@gmail.com';
const DEFAULT_SITE_URL = 'https://laikona.devand.net';
const WORDMARK_BLACK_URL = 'https://laikona.devand.net/brand/email-wordmark-ink.png';
const STROKE_PORCELAIN_URL = 'https://laikona.devand.net/brand/email-stroke-porcelain.png';
const WAVE_TO_WHITE_URL = 'https://laikona.devand.net/brand/email-wave-to-white.png';
const HERO_BG_CHERRY_URL = 'https://laikona.devand.net/brand/email-hero-bg-cherry.png';
const HERO_BG_OBSIDIAN_URL = 'https://laikona.devand.net/brand/email-hero-bg-obsidian.png';
const CHERRIES_MARK_URL = 'https://laikona.devand.net/brand/email-cherries-mark.png';
const EDITORIAL_HERO_URL = 'https://laikona.devand.net/brand/email-editorial-hero.jpg';

const SERIF = "'Source Serif 4', Georgia, 'Times New Roman', serif";
const SANS = "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

const C = {
  rosa: '#FAF5F5',
  tinte: '#F3E8EA',
  linea: '#EFE1E3',
  lineaStrong: '#E4D1D4',
  white: '#FFFFFF',
  ink: '#181314',
  body: '#4D4042',
  muted: '#7E6C70',
  cereza: '#8B1E2B',
  suave: '#F1D4D8',
  suaveInk: '#D8CFD1',
};

function renderWebShell({
  preheader,
  eyebrow,
  badgeText,
  headline,
  heroImageUrl = null,
  heroAlt = 'LAIKONA NAILS BY KARLA',
  tone = 'cherry',
  bodyHtml,
  primaryCta,
  secondaryCta,
  footnoteHtml = '',
}) {
  const isAdmin = tone === 'obsidian';
  const heroBg = isAdmin ? C.ink : C.cereza;
  const heroBgUrl = isAdmin ? HERO_BG_OBSIDIAN_URL : HERO_BG_CHERRY_URL;
  const eyebrowColor = isAdmin ? C.suaveInk : C.suave;
  const ctaBg = isAdmin ? C.ink : C.cereza;

  const badgeHtml = badgeText
    ? `<td align="right" valign="middle" style="padding-left:12px;">
                      <span style="display:inline-block;padding:4px 11px;border-radius:999px;background-color:rgba(255,255,255,0.16);font-family:${SANS};font-size:11px;font-weight:600;letter-spacing:0.04em;color:${C.white};white-space:nowrap;font-variant-numeric:tabular-nums;">${badgeText}</span>
                    </td>`
    : '';

  const heroPhotoHtml = heroImageUrl
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;">
                <tr>
                  <td style="line-height:0;font-size:0;border-radius:18px;overflow:hidden;">
                    <img src="${heroImageUrl}" alt="${heroAlt}" width="488" style="display:block;width:100%;max-width:488px;height:auto;border:0;border-radius:18px;" />
                  </td>
                </tr>
              </table>`
    : '';

  const primaryCtaHtml = primaryCta
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:26px;">
                <tr>
                  <td align="center" bgcolor="${ctaBg}" style="background-color:${ctaBg};border-radius:999px;">
                    <a href="${primaryCta.href}" style="display:block;padding:15px 26px;font-family:${SANS};font-size:14.5px;font-weight:600;line-height:1.2;color:${C.white};text-decoration:none;text-align:center;border-radius:999px;">
                      ${primaryCta.label}
                    </a>
                  </td>
                </tr>
              </table>`
    : '';

  const secondaryCtaHtml = secondaryCta
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:10px;">
                <tr>
                  <td align="center" bgcolor="${C.rosa}" style="background-color:${C.rosa};border:1px solid ${C.lineaStrong};border-radius:999px;">
                    <a href="${secondaryCta.href}" style="display:block;padding:13px 24px;font-family:${SANS};font-size:13.5px;font-weight:600;line-height:1.2;color:${C.ink};text-decoration:none;text-align:center;border-radius:999px;">
                      ${secondaryCta.label}
                    </a>
                  </td>
                </tr>
              </table>`
    : '';

  const noteHtml = footnoteHtml
    ? `<p style="margin:20px 0 0;font-family:${SANS};font-size:12.5px;line-height:1.65;color:${C.muted};text-align:center;">${footnoteHtml}</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <title>${headline}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,500;0,8..60,600;1,8..60,400&display=swap');
    @media only screen and (max-width:600px) {
      .lk-outer { padding: 14px 8px 24px !important; }
      .lk-card { border-radius: 20px !important; }
      .lk-pad { padding-left: 22px !important; padding-right: 22px !important; }
      .lk-hero-pad { padding: 24px 22px 10px !important; }
      .lk-h1 { font-size: 27px !important; line-height: 1.06 !important; }
      .lk-otp { font-size: 32px !important; letter-spacing: 8px !important; padding-left: 8px !important; }
      .lk-row-label { width: 42% !important; font-size: 10.5px !important; }
      .lk-row-val { font-size: 13.5px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${C.rosa};-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${preheader}&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.rosa}" class="lk-outer" style="background-color:${C.rosa};padding:28px 12px 40px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.white}" class="lk-card" style="max-width:560px;background-color:${C.white};border:1px solid ${C.linea};border-radius:24px;overflow:hidden;box-shadow:0 20px 48px -32px rgba(139,30,43,0.28);">
          <tr>
            <td align="center" bgcolor="${C.white}" style="background-color:${C.white};padding:18px 28px 16px;border-bottom:1px solid ${C.tinte};">
              <a href="{{{SITE_URL}}}" style="text-decoration:none;border:0;display:inline-block;">
                <img src="${WORDMARK_BLACK_URL}" alt="LAIKONA NAILS BY KARLA" width="142" style="display:block;width:142px;max-width:100%;height:auto;border:0;margin:0 auto;" />
              </a>
            </td>
          </tr>
          <tr>
            <td bgcolor="${heroBg}" background="${heroBgUrl}" style="background-color:${heroBg};background-image:url('${heroBgUrl}');background-repeat:no-repeat;background-position:right top;background-size:cover;padding:0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td class="lk-hero-pad" style="padding:28px 36px 14px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td valign="middle" style="font-family:${SANS};font-size:10.5px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:${eyebrowColor};">
                          ${eyebrow}
                        </td>
                        ${badgeHtml}
                      </tr>
                    </table>
                    <h1 class="lk-h1" style="margin:12px 0 10px;font-family:${SERIF};font-size:34px;font-weight:500;line-height:1.04;letter-spacing:-0.025em;color:${C.white};">
                      ${headline}
                    </h1>
                    <img src="${STROKE_PORCELAIN_URL}" alt="" width="128" style="display:block;width:128px;max-width:44%;height:auto;border:0;" />
                  </td>
                </tr>
                <tr>
                  <td style="padding:0;line-height:0;font-size:0;">
                    <img src="${WAVE_TO_WHITE_URL}" alt="" width="560" style="display:block;width:100%;height:auto;border:0;" />
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="lk-pad" bgcolor="${C.white}" style="background-color:${C.white};padding:22px 36px 34px;">
              ${bodyHtml}
              ${heroPhotoHtml}
              ${primaryCtaHtml}
              ${secondaryCtaHtml}
              ${noteHtml}
            </td>
          </tr>
          <tr>
            <td class="lk-pad" align="center" bgcolor="${C.rosa}" style="background-color:${C.rosa};border-top:1px solid ${C.linea};padding:26px 36px 30px;">
              <img src="${CHERRIES_MARK_URL}" alt="" width="22" height="26" style="display:block;width:22px;height:26px;margin:0 auto 12px;border:0;" />
              <p style="margin:0;font-family:${SANS};font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:${C.ink};">
                {{{SALON_NAME}}}
              </p>
              <p style="margin:6px 0 0;font-family:${SANS};font-size:12.5px;line-height:1.55;color:${C.body};">
                {{{ADDRESS}}}
              </p>
              <p style="margin:4px 0 0;font-family:${SANS};font-size:11.5px;line-height:1.5;color:${C.muted};font-variant-numeric:tabular-nums;">
                Lunes a sábado &middot; 10:00 a 6:00 &middot; Solo con cita
              </p>
              <p style="margin:12px 0 0;font-family:${SANS};font-size:12px;line-height:1.5;color:${C.muted};">
                <span style="color:${C.cereza};font-weight:600;">{{{INSTAGRAM_HANDLE}}}</span>
                &nbsp;&nbsp;<span style="color:${C.cereza};">&#10047;</span>&nbsp;&nbsp;
                <a href="{{{SITE_URL}}}" style="color:${C.body};text-decoration:none;border-bottom:1px solid ${C.lineaStrong};padding-bottom:1px;">{{{SITE_URL}}}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function renderSummaryCard(rows, { title = null, highlightLast = false, accentColor = C.cereza } = {}) {
  const titleRow = title
    ? `<tr>
                  <td colspan="2" style="padding:14px 0 8px;font-family:${SANS};font-size:10.5px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${accentColor};border-bottom:1px solid ${C.linea};">
                    ${title}
                  </td>
                </tr>`
    : '';

  const trs = rows
    .map(([label, value], i) => {
      const isLast = i === rows.length - 1;
      const borderStyle = isLast ? '' : `border-bottom:1px solid ${C.linea};`;
      const isHighlight = highlightLast && isLast;
      const valFont = isHighlight
        ? `font-family:${SERIF};font-size:19px;font-weight:500;color:${accentColor};`
        : `font-family:${SANS};font-size:14px;font-weight:600;color:${C.ink};`;
      return `<tr>
                  <td class="lk-row-label" style="${borderStyle}padding:12px 10px 12px 0;font-family:${SANS};font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${C.muted};width:38%;vertical-align:top;">
                    ${label}
                  </td>
                  <td align="right" class="lk-row-val" style="${borderStyle}padding:12px 0;${valFont}line-height:1.4;vertical-align:top;font-variant-numeric:tabular-nums;">
                    ${value}
                  </td>
                </tr>`;
    })
    .join('\n');

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.rosa}" style="margin-top:22px;background-color:${C.rosa};border:1px solid ${C.linea};border-radius:18px;">
                <tr>
                  <td style="padding:4px 20px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      ${titleRow}
                      ${trs}
                    </table>
                  </td>
                </tr>
              </table>`;
}

function renderTipsList(tips) {
  const rows = tips
    .map(
      (tip, i) => `<tr>
                  <td width="32" valign="top" style="padding:6px 0;">
                    <span style="display:inline-block;width:24px;height:24px;line-height:24px;text-align:center;border-radius:999px;background-color:${C.tinte};color:${C.cereza};font-family:${SANS};font-size:11.5px;font-weight:700;font-variant-numeric:tabular-nums;">${i + 1}</span>
                  </td>
                  <td valign="top" style="padding:7px 0 7px 6px;font-family:${SANS};font-size:13.5px;line-height:1.6;color:${C.body};">
                    ${tip}
                  </td>
                </tr>`,
    )
    .join('\n');

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px;">
                <tr>
                  <td colspan="2" style="padding-bottom:6px;font-family:${SANS};font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${C.ink};">
                    Para tu visita
                  </td>
                </tr>
                ${rows}
              </table>`;
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
    html: renderWebShell({
      preheader: 'Apartamos tu espacio {{{BOOKING_CODE}}}. Realiza tu anticipo SPEI para confirmarlo.',
      eyebrow: 'ANTICIPO PENDIENTE',
      badgeText: '{{{BOOKING_CODE}}}',
      headline: 'Apartamos tu espacio.',
      bodyHtml: `
              <p style="margin:0;font-family:${SANS};font-size:15px;line-height:1.72;color:${C.body};">
                Hola <strong style="color:${C.ink};">{{{CLIENT_NAME}}}</strong>, reservamos provisionalmente tu horario en el estudio. Para dejar tu cita confirmada, realiza tu transferencia SPEI y sube tu comprobante desde tu enlace personal.
              </p>
              ${renderSummaryCard(
                [
                  ['Servicio', '{{{SERVICE_NAME}}}'],
                  ['Artista', '{{{STAFF_NAME}}}'],
                  ['Fecha', '{{{DATE_LABEL}}}'],
                  ['Horario', '{{{TIME_LABEL}}}'],
                  ['Total aprox.', '{{{TOTAL_LABEL}}}'],
                ],
                { title: 'Resumen de tu cita', highlightLast: true },
              )}
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.cereza}" style="margin-top:18px;background-color:${C.cereza};border-radius:20px;">
                <tr>
                  <td style="padding:22px 24px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td valign="middle" style="font-family:${SANS};font-size:10.5px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:${C.suave};">
                          Anticipo para apartar
                        </td>
                        <td align="right" valign="middle" style="font-family:${SERIF};font-size:26px;font-weight:500;line-height:1;color:${C.white};font-variant-numeric:tabular-nums;">
                          {{{DEPOSIT_LABEL}}}
                        </td>
                      </tr>
                    </table>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;border-top:1px solid rgba(255,255,255,0.2);">
                      <tr>
                        <td style="padding-top:14px;font-family:${SANS};font-size:13.5px;line-height:1.65;color:${C.white};">
                          <span style="color:${C.suave};">Banco:</span>&nbsp; {{{BANK_NAME}}}<br />
                          <span style="color:${C.suave};">Titular:</span>&nbsp; {{{BENEFICIARY}}}
                        </td>
                      </tr>
                    </table>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;background-color:rgba(255,255,255,0.14);border-radius:14px;">
                      <tr>
                        <td style="padding:12px 16px;">
                          <p style="margin:0 0 3px;font-family:${SANS};font-size:10px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:${C.suave};">
                            CLABE interbancaria
                          </p>
                          <p style="margin:0;font-family:${MONO};font-size:16px;font-weight:700;letter-spacing:0.08em;color:${C.white};">
                            {{{CLABE}}}
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>`,
      primaryCta: {
        label: 'Subir comprobante y ver mi cita',
        href: '{{{MANAGE_URL}}}',
      },
      secondaryCta: {
        label: 'Enviar comprobante por WhatsApp',
        href: '{{{WHATSAPP_URL}}}',
      },
      footnoteHtml:
        'Adjuntamos tu invitación de calendario (.ics) lista para guardar en un clic.',
    }),
    text: `LAIKONA NAILS BY KARLA · PUEBLA
ANTICIPO PENDIENTE · {{{BOOKING_CODE}}}

Apartamos tu espacio.

Hola {{{CLIENT_NAME}}},
Reservamos provisionalmente tu horario en el estudio. Para dejar tu cita confirmada, realiza tu anticipo SPEI y sube tu comprobante desde tu enlace personal.

RESUMEN DE TU CITA
Servicio: {{{SERVICE_NAME}}}
Artista: {{{STAFF_NAME}}}
Fecha: {{{DATE_LABEL}}}
Horario: {{{TIME_LABEL}}}
Total aprox.: {{{TOTAL_LABEL}}}

ANTICIPO PARA APARTAR — {{{DEPOSIT_LABEL}}}
Banco: {{{BANK_NAME}}}
Titular: {{{BENEFICIARY}}}
CLABE: {{{CLABE}}}

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
    html: renderWebShell({
      preheader: 'Tu cita {{{BOOKING_CODE}}} de {{{SERVICE_NAME}}} con {{{STAFF_NAME}}} está confirmada.',
      eyebrow: 'CITA CONFIRMADA',
      badgeText: '{{{BOOKING_CODE}}}',
      headline: 'Tu lugar está listo.',
      heroImageUrl: EDITORIAL_HERO_URL,
      heroAlt: 'Manicure editorial cereza en LAIKONA NAILS BY KARLA',
      bodyHtml: `
              <p style="margin:0;font-family:${SANS};font-size:15px;line-height:1.72;color:${C.body};">
                Hola <strong style="color:${C.ink};">{{{CLIENT_NAME}}}</strong>, qué gusto recibirte pronto. Tu cita en <strong style="color:${C.ink};">{{{SALON_NAME}}}</strong> ha quedado confirmada y preparada especialmente para ti.
              </p>
              ${renderSummaryCard(
                [
                  ['Servicio', '{{{SERVICE_NAME}}}'],
                  ['Artista', '{{{STAFF_NAME}}}'],
                  ['Fecha', '{{{DATE_LABEL}}}'],
                  ['Horario', '{{{TIME_LABEL}}}'],
                  ['Total', '{{{TOTAL_LABEL}}}'],
                ],
                { title: 'Tu cita', highlightLast: true },
              )}
              ${renderTipsList([
                'Llega 5 a 10 minutos antes para comenzar con calma.',
                'Cuidamos cada set con 15 minutos máximos de tolerancia.',
                'Si ya tienes foto de inspiración, tráela lista para revisarla juntas.',
              ])}`,
      primaryCta: {
        label: 'Ver detalles o reagendar',
        href: '{{{MANAGE_URL}}}',
      },
      secondaryCta: {
        label: 'Escribir por WhatsApp al estudio',
        href: '{{{WHATSAPP_URL}}}',
      },
      footnoteHtml:
        'Adjuntamos tu invitación de calendario (.ics) para guardarla con un clic.',
    }),
    text: `LAIKONA NAILS BY KARLA · PUEBLA
CITA CONFIRMADA · {{{BOOKING_CODE}}}

Tu lugar está listo.

Hola {{{CLIENT_NAME}}},
Tu cita en {{{SALON_NAME}}} ha quedado confirmada.

Servicio: {{{SERVICE_NAME}}}
Artista: {{{STAFF_NAME}}}
Fecha: {{{DATE_LABEL}}}
Horario: {{{TIME_LABEL}}}
Total: {{{TOTAL_LABEL}}}

PARA TU VISITA
1 · Llega 5 a 10 minutos antes.
2 · Tolerancia máxima de 15 minutos.
3 · Trae tu foto de inspiración si tienes una idea en mente.

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
    html: renderWebShell({
      preheader: 'Mañana tienes cita de {{{SERVICE_NAME}}} a las {{{TIME_LABEL}}} con {{{STAFF_NAME}}}.',
      eyebrow: 'RECORDATORIO · 24 HORAS',
      badgeText: '{{{BOOKING_CODE}}}',
      headline: 'Mañana te esperamos.',
      bodyHtml: `
              <p style="margin:0;font-family:${SANS};font-size:15px;line-height:1.72;color:${C.body};">
                Hola <strong style="color:${C.ink};">{{{CLIENT_NAME}}}</strong>, te compartimos los detalles de tu cita de mañana en el estudio. Si necesitas mover tu horario, puedes hacerlo directo desde tu enlace personal.
              </p>
              ${renderSummaryCard(
                [
                  ['Servicio', '{{{SERVICE_NAME}}}'],
                  ['Artista', '{{{STAFF_NAME}}}'],
                  ['Fecha', '{{{DATE_LABEL}}}'],
                  ['Horario', '{{{TIME_LABEL}}}'],
                  ['Ubicación', '{{{ADDRESS}}}'],
                ],
                { title: 'Tu visita de mañana' },
              )}`,
      primaryCta: {
        label: 'Gestionar mi cita',
        href: '{{{MANAGE_URL}}}',
      },
      secondaryCta: {
        label: 'Avisar por WhatsApp',
        href: '{{{WHATSAPP_URL}}}',
      },
      footnoteHtml:
        'Te agradecemos avisar cualquier cambio con anticipación para cuidar tu anticipo.',
    }),
    text: `LAIKONA NAILS BY KARLA · PUEBLA
RECORDATORIO 24 H · {{{BOOKING_CODE}}}

Mañana te esperamos.

Hola {{{CLIENT_NAME}}},
Detalles de tu cita de mañana:
Servicio: {{{SERVICE_NAME}}}
Artista: {{{STAFF_NAME}}}
Fecha: {{{DATE_LABEL}}}
Horario: {{{TIME_LABEL}}}
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
    html: renderWebShell({
      preheader: 'Hoy es tu cita a las {{{TIME_LABEL}}} con {{{STAFF_NAME}}} en {{{SALON_NAME}}}.',
      eyebrow: 'HOY EN EL ESTUDIO',
      badgeText: '{{{BOOKING_CODE}}}',
      headline: 'Nos vemos muy pronto.',
      bodyHtml: `
              <p style="margin:0;font-family:${SANS};font-size:15px;line-height:1.72;color:${C.body};">
                Hola <strong style="color:${C.ink};">{{{CLIENT_NAME}}}</strong>, tu mesa está por quedar lista. Te esperamos hoy en <strong style="color:${C.ink};">{{{SALON_NAME}}}</strong>:
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.rosa}" style="margin-top:22px;background-color:${C.rosa};border:1px solid ${C.linea};border-radius:20px;">
                <tr>
                  <td align="center" style="padding:26px 20px;">
                    <p style="margin:0 0 6px;font-family:${SANS};font-size:10.5px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:${C.muted};">
                      Horario de hoy
                    </p>
                    <p style="margin:0;font-family:${SERIF};font-size:42px;font-weight:500;line-height:1;letter-spacing:-0.02em;color:${C.cereza};font-variant-numeric:tabular-nums;">
                      {{{TIME_LABEL}}}
                    </p>
                    <p style="margin:12px 0 0;font-family:${SANS};font-size:14.5px;font-weight:600;color:${C.ink};">
                      {{{SERVICE_NAME}}} &nbsp;&middot;&nbsp; con {{{STAFF_NAME}}}
                    </p>
                    <p style="margin:6px 0 0;font-family:${SANS};font-size:13px;line-height:1.5;color:${C.muted};">
                      {{{ADDRESS}}}
                    </p>
                  </td>
                </tr>
              </table>`,
      primaryCta: {
        label: 'Abrir ubicación y detalles',
        href: '{{{MANAGE_URL}}}',
      },
      secondaryCta: {
        label: '¿Vienes en camino? Escríbenos por WhatsApp',
        href: '{{{WHATSAPP_URL}}}',
      },
    }),
    text: `LAIKONA NAILS BY KARLA · PUEBLA
HOY EN EL ESTUDIO · {{{BOOKING_CODE}}}

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
    html: renderWebShell({
      preheader: 'Actualizamos tu cita {{{BOOKING_CODE}}} al {{{DATE_LABEL}}} a las {{{TIME_LABEL}}}.',
      eyebrow: 'CAMBIO DE HORARIO',
      badgeText: '{{{BOOKING_CODE}}}',
      headline: 'Actualizamos tu cita.',
      bodyHtml: `
              <p style="margin:0;font-family:${SANS};font-size:15px;line-height:1.72;color:${C.body};">
                Hola <strong style="color:${C.ink};">{{{CLIENT_NAME}}}</strong>, guardamos tu nueva fecha sin problema. Estos son los datos actualizados de tu próxima visita:
              </p>
              ${renderSummaryCard(
                [
                  ['Nueva fecha', '{{{DATE_LABEL}}}'],
                  ['Nuevo horario', '{{{TIME_LABEL}}}'],
                  ['Servicio', '{{{SERVICE_NAME}}}'],
                  ['Artista', '{{{STAFF_NAME}}}'],
                ],
                { title: 'Nuevo horario confirmado' },
              )}`,
      primaryCta: {
        label: 'Ver mi cita actualizada',
        href: '{{{MANAGE_URL}}}',
      },
      secondaryCta: {
        label: 'Escribir por WhatsApp al estudio',
        href: '{{{WHATSAPP_URL}}}',
      },
      footnoteHtml:
        'Adjuntamos el archivo .ics actualizado para reemplazar la fecha anterior en tu calendario.',
    }),
    text: `LAIKONA NAILS BY KARLA · PUEBLA
CAMBIO DE HORARIO · {{{BOOKING_CODE}}}

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
    html: renderWebShell({
      preheader: 'Confirmamos la cancelación de tu cita {{{BOOKING_CODE}}} en {{{SALON_NAME}}}.',
      eyebrow: 'CANCELACIÓN CONFIRMADA',
      badgeText: '{{{BOOKING_CODE}}}',
      headline: 'Tu cita ha sido cancelada.',
      bodyHtml: `
              <p style="margin:0;font-family:${SANS};font-size:15px;line-height:1.72;color:${C.body};">
                Hola <strong style="color:${C.ink};">{{{CLIENT_NAME}}}</strong>, liberamos tu espacio en agenda tal como se solicitó. Cuando desees agendar de nuevo, estaremos encantadas de recibirte.
              </p>
              ${renderSummaryCard(
                [
                  ['Servicio', '{{{SERVICE_NAME}}}'],
                  ['Artista', '{{{STAFF_NAME}}}'],
                  ['Fecha original', '{{{DATE_LABEL}}} · {{{TIME_LABEL}}}'],
                  ['Nota', '{{{CANCELLATION_NOTE}}}'],
                ],
                { title: 'Detalle de cancelación' },
              )}`,
      primaryCta: {
        label: 'Agendar una nueva fecha',
        href: '{{{BOOKING_URL}}}',
      },
      secondaryCta: {
        label: '¿Necesitas ayuda? Escríbenos por WhatsApp',
        href: '{{{WHATSAPP_URL}}}',
      },
    }),
    text: `LAIKONA NAILS BY KARLA · PUEBLA
CANCELACIÓN · {{{BOOKING_CODE}}}

Tu cita ha sido cancelada.

Hola {{{CLIENT_NAME}}},
Liberamos tu horario en agenda:
Servicio: {{{SERVICE_NAME}}}
Artista: {{{STAFF_NAME}}}
Fecha original: {{{DATE_LABEL}}} · {{{TIME_LABEL}}}
Nota: {{{CANCELLATION_NOTE}}}

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
    html: renderWebShell({
      preheader: 'Ya casi cumplen 3 semanas tus uñas. Aparta tu retoque en {{{SALON_NAME}}}.',
      eyebrow: 'CUIDADO DE TU SET',
      badgeText: '3 semanas',
      headline: '¿Lista para tu retoque?',
      heroImageUrl: EDITORIAL_HERO_URL,
      heroAlt: 'Set editorial cereza en LAIKONA NAILS BY KARLA',
      bodyHtml: `
              <p style="margin:0;font-family:${SANS};font-size:15px;line-height:1.72;color:${C.body};">
                Hola <strong style="color:${C.ink};">{{{CLIENT_NAME}}}</strong>, ya casi cumplen tres semanas desde tu último servicio de <strong style="color:${C.ink};">{{{SERVICE_NAME}}}</strong> con {{{STAFF_NAME}}}. Renovar tu set a tiempo mantiene tu uña natural fuerte, ligera y con estructura impecable.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.rosa}" style="margin-top:20px;background-color:${C.rosa};border:1px solid ${C.linea};border-radius:18px;">
                <tr>
                  <td style="padding:18px 22px;">
                    <p style="margin:0;font-family:${SERIF};font-style:italic;font-size:17px;line-height:1.55;color:${C.ink};">
                      “El secreto de unas uñas que siempre se ven impecables está en el retoque a tiempo.”
                    </p>
                  </td>
                </tr>
              </table>`,
      primaryCta: {
        label: 'Apartar mi retoque en línea',
        href: '{{{BOOKING_URL}}}',
      },
      secondaryCta: {
        label: 'Consultar horarios por WhatsApp',
        href: '{{{WHATSAPP_URL}}}',
      },
    }),
    text: `LAIKONA NAILS BY KARLA · PUEBLA
CUIDADO DE TU SET · 3 SEMANAS

¿Lista para tu retoque?

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
    html: renderWebShell({
      preheader: 'Tienes {{{TTL_MINUTES}}} minutos de prioridad para apartar el espacio del {{{DATE_LABEL}}}.',
      eyebrow: 'LISTA DE ESPERA',
      badgeText: 'Prioridad {{{TTL_MINUTES}}} min',
      headline: 'Se abrió un lugar para ti.',
      heroImageUrl: EDITORIAL_HERO_URL,
      heroAlt: 'Espacio disponible en LAIKONA NAILS BY KARLA',
      bodyHtml: `
              <p style="margin:0;font-family:${SANS};font-size:15px;line-height:1.72;color:${C.body};">
                Hola <strong style="color:${C.ink};">{{{CLIENT_NAME}}}</strong>, acaba de liberarse un espacio que coincide con tu solicitud en el estudio. Lo mantenemos reservado de forma prioritaria para ti durante los próximos <strong style="color:${C.cereza};">{{{TTL_MINUTES}}} minutos</strong>.
              </p>
              ${renderSummaryCard(
                [
                  ['Servicio', '{{{SERVICE_NAME}}}'],
                  ['Artista', '{{{STAFF_NAME}}}'],
                  ['Fecha', '{{{DATE_LABEL}}}'],
                  ['Horario libre', '{{{TIME_LABEL}}}'],
                ],
                { title: 'Espacio disponible' },
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
    html: renderWebShell({
      preheader: 'Tu código privado de {{{SALON_NAME}}} es {{{OTP_CODE}}}. Válido por {{{EXPIRES_MINUTES}}} minutos.',
      eyebrow: 'PORTAL MIS CITAS',
      badgeText: 'Acceso privado',
      headline: 'Tu código de acceso.',
      bodyHtml: `
              <p style="margin:0;font-family:${SANS};font-size:15px;line-height:1.72;color:${C.body};">
                Hola <strong style="color:${C.ink};">{{{CLIENT_NAME}}}</strong>, ingresa este código de un solo uso para consultar tus próximas citas, historial y sellos de fidelidad:
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.rosa}" style="margin-top:22px;background-color:${C.rosa};border:1px solid ${C.linea};border-radius:20px;">
                <tr>
                  <td align="center" style="padding:28px 16px;">
                    <p class="lk-otp" style="margin:0;font-family:${MONO};font-size:38px;font-weight:700;letter-spacing:10px;color:${C.cereza};padding-left:10px;line-height:1.1;">
                      {{{OTP_CODE}}}
                    </p>
                    <p style="margin:14px 0 0;">
                      <span style="display:inline-block;padding:5px 12px;border-radius:999px;background-color:${C.tinte};font-family:${SANS};font-size:11px;font-weight:600;color:${C.cereza};font-variant-numeric:tabular-nums;">
                        Válido por {{{EXPIRES_MINUTES}}} minutos &middot; Uso personal
                      </span>
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
    }),
    text: `LAIKONA NAILS BY KARLA · PUEBLA
PORTAL MIS CITAS · ACCESO PRIVADO

Tu código de acceso: {{{OTP_CODE}}}

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
    html: renderWebShell({
      preheader: '{{{ALERT_HEADING}}} ({{{BOOKING_CODE}}}) — {{{CLIENT_NAME}}}.',
      eyebrow: 'PANEL ESTUDIO · {{{ALERT_BADGE}}}',
      badgeText: '{{{BOOKING_CODE}}}',
      tone: 'obsidian',
      headline: '{{{ALERT_HEADING}}}',
      bodyHtml: `
              <p style="margin:0;font-family:${SANS};font-size:15px;line-height:1.72;color:${C.body};">
                {{{ALERT_DETAIL}}}
              </p>
              ${renderSummaryCard(
                [
                  ['Clienta', '{{{CLIENT_NAME}}}'],
                  ['WhatsApp', '{{{CLIENT_PHONE}}}'],
                  ['Servicio', '{{{SERVICE_NAME}}}'],
                  ['Artista', '{{{STAFF_NAME}}}'],
                  ['Fecha y hora', '{{{DATE_LABEL}}} · {{{TIME_LABEL}}}'],
                ],
                { title: 'Movimiento en agenda', accentColor: C.ink },
              )}`,
      primaryCta: {
        label: 'Abrir agenda en Admin',
        href: '{{{ADMIN_URL}}}',
      },
    }),
    text: `LAIKONA NAILS · PANEL ESTUDIO
{{{ALERT_BADGE}}} · {{{BOOKING_CODE}}}

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
    html: renderWebShell({
      preheader: 'Respalda {{{ASSETS_COUNT}}} archivo(s) antes de su purga automática en {{{STAGE_LABEL}}}.',
      eyebrow: 'RESPALDO CONTABLE',
      badgeText: 'En {{{STAGE_LABEL}}}',
      tone: 'obsidian',
      headline: '{{{HEADING_TEXT}}}',
      bodyHtml: `
              <p style="margin:0;font-family:${SANS};font-size:15px;line-height:1.72;color:${C.body};">
                {{{INTRO_TEXT}}}
              </p>
              ${renderSummaryCard(
                [
                  ['Archivos en lote', '{{{ASSETS_COUNT}}}'],
                  ['Comprobantes SPEI', '{{{PROOFS_COUNT}}}'],
                  ['Fotos de referencia', '{{{INSPO_COUNT}}}'],
                  ['Peso total', '{{{TOTAL_SIZE}}}'],
                ],
                { title: 'Resumen del lote', accentColor: C.ink },
              )}
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.rosa}" style="margin-top:16px;background-color:${C.rosa};border:1px solid ${C.linea};border-radius:16px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0 0 8px;font-family:${SANS};font-size:10.5px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${C.muted};">
                      Vista previa del lote
                    </p>
                    <p style="margin:0;font-family:${MONO};font-size:12px;line-height:1.7;color:${C.body};white-space:pre-line;">
                      {{{ASSETS_PREVIEW}}}
                    </p>
                  </td>
                </tr>
              </table>`,
      primaryCta: {
        label: 'Abrir Caja y respaldar comprobantes',
        href: '{{{CAJA_URL}}}',
      },
      footnoteHtml:
        'Tu historial de citas, pagos, reportes de caja y datos de clientas permanecen intactos; únicamente se depuran las imágenes mayores a 12 meses.',
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
    html = html.split('https://laikona.devand.net/brand').join(assetBaseUrl);
  }
  return { html, text, subject };
}

function buildGalleryHtml(assetBaseUrl) {
  const logoSrc = assetBaseUrl
    ? `${assetBaseUrl}/email-wordmark-ink.png`
    : WORDMARK_BLACK_URL;

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
  <title>LAIKONA NAILS · Galería de Plantillas de Correo</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,500;0,8..60,600;1,8..60,400&display=swap" rel="stylesheet" />
  <style>
    :root {
      --bg: #FAF5F5;
      --surface: #FFFFFF;
      --ink: #181314;
      --muted: #7E6C70;
      --cherry: #8B1E2B;
      --cherry-soft: #F3E8EA;
      --line: #EFE1E3;
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
    .brand-logo {
      display: block;
      width: 132px;
      height: auto;
      margin-bottom: 10px;
    }
    .brand-title {
      font-family: 'Source Serif 4', Georgia, serif;
      font-size: 21px;
      font-weight: 500;
      letter-spacing: -0.02em;
      margin: 0;
      line-height: 1.15;
    }
    .brand-sub {
      font-size: 12px;
      color: var(--muted);
      margin: 5px 0 0;
    }
    .group-label {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--muted);
      padding: 14px 10px 6px;
      margin: 0;
    }
    .nav-btn {
      width: 100%;
      text-align: left;
      background: transparent;
      border: 1px solid transparent;
      border-radius: 14px;
      padding: 10px 12px;
      margin-bottom: 4px;
      cursor: pointer;
      display: block;
      transition: background 140ms ease, border-color 140ms ease;
    }
    .nav-btn:hover {
      background: var(--bg);
    }
    .nav-btn.active {
      background: var(--cherry-soft);
      border-color: rgba(139, 30, 43, 0.35);
    }
    .nav-name {
      display: block;
      font-size: 13.5px;
      font-weight: 600;
      color: var(--ink);
      line-height: 1.3;
    }
    .nav-meta {
      display: block;
      font-size: 11px;
      color: var(--muted);
      margin-top: 2px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    main {
      min-width: 0;
      display: flex;
      flex-direction: column;
    }
    .toolbar {
      position: sticky;
      top: 0;
      z-index: 20;
      background: rgba(255, 255, 255, 0.94);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--line);
      padding: 14px 28px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
    }
    .mail-meta {
      min-width: 240px;
      flex: 1;
    }
    .mail-subject {
      font-family: 'Source Serif 4', Georgia, serif;
      font-size: 19px;
      font-weight: 500;
      letter-spacing: -0.015em;
      margin: 0 0 3px;
    }
    .mail-headers {
      font-size: 12px;
      color: var(--muted);
      margin: 0;
    }
    .mail-headers strong { color: var(--ink); font-weight: 600; }
    .modes {
      display: inline-flex;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: var(--bg);
      padding: 3px;
      gap: 3px;
    }
    .mode-btn {
      border: 0;
      border-radius: 999px;
      background: transparent;
      color: var(--muted);
      font-family: inherit;
      font-size: 12px;
      font-weight: 600;
      padding: 7px 14px;
      cursor: pointer;
    }
    .mode-btn.active {
      background: var(--cherry);
      color: #fff;
    }
    .stage {
      padding: 28px;
      flex: 1;
    }
    .split {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      justify-content: center;
      gap: 28px;
    }
    .device-col {
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .device-label {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--muted);
      margin: 0 0 10px;
    }
    .desktop-frame {
      width: 660px;
      max-width: 100%;
      background: #fff;
      border: 1px solid var(--line);
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 20px 50px -30px rgba(139, 30, 43, 0.24);
    }
    .desktop-chrome {
      height: 32px;
      background: #FAF5F5;
      border-bottom: 1px solid var(--line);
      display: flex;
      align-items: center;
      padding: 0 14px;
      gap: 6px;
      font-size: 11px;
      color: var(--muted);
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #DFC9CD;
    }
    .mobile-bezel {
      width: 414px;
      background: #181314;
      border-radius: 42px;
      padding: 12px;
      box-shadow: 0 24px 54px -24px rgba(24, 19, 20, 0.45);
    }
    .mobile-notch {
      width: 108px;
      height: 18px;
      background: #181314;
      border-radius: 0 0 14px 14px;
      margin: 0 auto 8px;
    }
    .mobile-screen {
      width: 390px;
      background: #FAF5F5;
      border-radius: 30px;
      overflow: hidden;
    }
    iframe.email-iframe {
      display: block;
      width: 100%;
      border: 0;
      background: #FAF5F5;
      min-height: 620px;
    }
    .text-card {
      max-width: 680px;
      margin: 0 auto;
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 20px;
      padding: 28px 32px;
    }
    .text-card pre {
      margin: 0;
      white-space: pre-wrap;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 13px;
      line-height: 1.7;
      color: var(--ink);
    }
    .all-stack {
      display: flex;
      flex-direction: column;
      gap: 44px;
    }
    .all-block {
      border-top: 1px solid var(--line);
      padding-top: 22px;
    }
    .all-block-head {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 18px;
    }
    .all-block-head h2 {
      font-family: 'Source Serif 4', Georgia, serif;
      font-size: 24px;
      font-weight: 500;
      margin: 0;
    }
    .all-block-head code {
      font-size: 12px;
      color: var(--cherry);
      background: var(--cherry-soft);
      border-radius: 999px;
      padding: 4px 10px;
    }
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
      <img class="brand-logo" src="${logoSrc}" alt="LAIKONA NAILS BY KARLA" />
      <h1 class="brand-title">Plantillas de Correo</h1>
      <p class="brand-sub">11 plantillas con identidad web · Desktop &amp; Móvil</p>
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
      <div class="modes" role="tablist">
        <button class="mode-btn active" data-mode="split">Desktop + Móvil</button>
        <button class="mode-btn" data-mode="desktop">Desktop</button>
        <button class="mode-btn" data-mode="mobile">Móvil</button>
        <button class="mode-btn" data-mode="text">Texto plano</button>
        <button class="mode-btn" data-mode="all">Ver las 11</button>
      </div>
    </header>
    <section class="stage" id="stage"></section>
  </main>

  <script>
    const TEMPLATES = ${safeDataJson};
    let currentIndex = 1;
    let currentMode = 'split';

    const navClient = document.getElementById('nav-client');
    const navAdmin = document.getElementById('nav-admin');
    const stage = document.getElementById('stage');
    const curSubject = document.getElementById('cur-subject');
    const curAlias = document.getElementById('cur-alias');
    const curSize = document.getElementById('cur-size');

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

    function createDesktopCol(tpl) {
      const col = document.createElement('div');
      col.className = 'device-col';
      col.innerHTML = '<p class="device-label">Desktop · 660 px</p><div class="desktop-frame"><div class="desktop-chrome"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span style="margin-left:8px;">Bandeja de entrada · Gmail / Apple Mail</span></div></div>';
      const iframe = document.createElement('iframe');
      iframe.className = 'email-iframe';
      iframe.title = tpl.name + ' (Desktop)';
      iframe.srcdoc = tpl.html;
      autoSizeIframe(iframe);
      col.querySelector('.desktop-frame').appendChild(iframe);
      return col;
    }

    function createMobileCol(tpl) {
      const col = document.createElement('div');
      col.className = 'device-col';
      col.innerHTML = '<p class="device-label">Móvil · 390 px (iPhone)</p><div class="mobile-bezel"><div class="mobile-notch"></div><div class="mobile-screen"></div></div>';
      const iframe = document.createElement('iframe');
      iframe.className = 'email-iframe';
      iframe.title = tpl.name + ' (Móvil)';
      iframe.srcdoc = tpl.html;
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
    }

    function renderStage() {
      const tpl = TEMPLATES[currentIndex];
      if (currentMode === 'all') {
        curSubject.textContent = 'Todas las plantillas (11) — Vista comparativa Desktop + Móvil';
        curAlias.textContent = 'laikona-*';
        curSize.textContent = '11 plantillas publicadas';
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
