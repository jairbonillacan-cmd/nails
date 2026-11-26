import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_FROM = 'LAIKONA NAILS <citas@laikona.devand.net>';
const DEFAULT_REPLY_TO = 'jairbonillacan@gmail.com';
const DEFAULT_SITE_URL = 'https://laikona.devand.net';
const WORDMARK_CHERRY_URL = 'https://laikona.devand.net/brand/email-wordmark-cherry.png';
const WORDMARK_INK_URL = 'https://laikona.devand.net/brand/email-wordmark-ink.png';
const CHERRIES_MARK_URL = 'https://laikona.devand.net/brand/email-cherries-mark.png';
const EDITORIAL_HERO_URL = 'https://laikona.devand.net/brand/email-editorial-hero.jpg';

const SERIF = "'Source Serif 4', Georgia, 'Times New Roman', serif";
const SANS = "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

const C = {
  canvas: '#F4EDED',
  paper: '#FFFEFD',
  ink: '#1A1415',
  body: '#4A3F42',
  muted: '#8C7A7E',
  cherry: '#8B1E2B',
  hairline: '#EAE0E0',
  slipBg: '#FAF5F5',
  white: '#FFFFFF',
};

function renderEditorialShell({
  preheader,
  metaLeft = 'PUEBLA · ESTUDIO PRIVADO',
  metaRight,
  kicker,
  headline,
  heroImageUrl = null,
  heroAlt = 'LAIKONA NAILS BY KARLA',
  wordmarkTone = 'cherry',
  topRuleColor = C.cherry,
  bodyHtml,
  primaryCta,
  secondaryLink,
  footnoteHtml = '',
}) {
  const wordmarkUrl = wordmarkTone === 'ink' ? WORDMARK_INK_URL : WORDMARK_CHERRY_URL;

  const heroRowHtml = heroImageUrl
    ? `
          <tr>
            <td class="lk-pad" style="padding:26px 44px 0;line-height:0;font-size:0;">
              <img src="${heroImageUrl}" alt="${heroAlt}" width="472" style="display:block;width:100%;max-width:472px;height:auto;border:0;" />
            </td>
          </tr>`
    : '';

  const ctaHtml = primaryCta
    ? `
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:34px;">
                <tr>
                  <td align="center" bgcolor="${topRuleColor}" style="background-color:${topRuleColor};">
                    <a href="${primaryCta.href}" style="display:block;padding:17px 28px;font-family:${SANS};font-size:11px;font-weight:600;letter-spacing:0.20em;text-transform:uppercase;line-height:1;color:${C.white};text-decoration:none;text-align:center;">
                      ${primaryCta.label}
                    </a>
                  </td>
                </tr>
              </table>`
    : '';

  const secondaryHtml = secondaryLink
    ? `<p style="margin:18px 0 0;text-align:center;font-family:${SANS};font-size:13px;line-height:1.5;color:${C.body};"><a href="${secondaryLink.href}" style="color:${C.body};text-decoration:none;border-bottom:1px solid #CBB8BB;padding-bottom:2px;">${secondaryLink.label}</a></p>`
    : '';

  const noteHtml = footnoteHtml
    ? `<p style="margin:26px 0 0;font-family:${SANS};font-size:12px;line-height:1.7;color:${C.muted};text-align:center;">${footnoteHtml}</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <title>${headline}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,500;1,8..60,400&display=swap');
    @media only screen and (max-width:600px) {
      .lk-pad { padding-left:24px !important; padding-right:24px !important; }
      .lk-h1 { font-size:28px !important; }
      .lk-otp { font-size:32px !important; letter-spacing:8px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${C.canvas};-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${preheader}&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.canvas}" style="background-color:${C.canvas};padding:36px 12px 44px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.paper}" style="max-width:560px;background-color:${C.paper};border:1px solid ${C.hairline};">
          <tr>
            <td height="3" bgcolor="${topRuleColor}" style="background-color:${topRuleColor};height:3px;line-height:3px;font-size:0;">&nbsp;</td>
          </tr>
          <tr>
            <td class="lk-pad" align="center" style="padding:36px 44px 26px;">
              <a href="{{{SITE_URL}}}" style="text-decoration:none;border:0;">
                <img src="${wordmarkUrl}" alt="LAIKONA NAILS BY KARLA" width="172" style="display:block;width:172px;max-width:100%;height:auto;border:0;margin:0 auto;" />
              </a>
            </td>
          </tr>
          <tr>
            <td class="lk-pad" style="padding:0 44px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${C.hairline};border-bottom:1px solid ${C.hairline};">
                <tr>
                  <td style="padding:10px 0;font-family:${SANS};font-size:9.5px;font-weight:500;letter-spacing:0.20em;text-transform:uppercase;color:${C.muted};">
                    ${metaLeft}
                  </td>
                  <td align="right" style="padding:10px 0;font-family:${SANS};font-size:9.5px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:${topRuleColor};">
                    ${metaRight}
                  </td>
                </tr>
              </table>
            </td>
          </tr>${heroRowHtml}
          <tr>
            <td class="lk-pad" style="padding:36px 44px 38px;">
              <p style="margin:0 0 12px;font-family:${SANS};font-size:10px;font-weight:600;letter-spacing:0.24em;text-transform:uppercase;color:${topRuleColor};">
                ${kicker}
              </p>
              <h1 class="lk-h1" style="margin:0 0 20px;font-family:${SERIF};font-size:33px;font-weight:400;line-height:1.14;letter-spacing:-0.015em;color:${C.ink};">
                ${headline}
              </h1>
              ${bodyHtml}
              ${ctaHtml}
              ${secondaryHtml}
              ${noteHtml}
            </td>
          </tr>
          <tr>
            <td class="lk-pad" align="center" bgcolor="${C.slipBg}" style="background-color:${C.slipBg};border-top:1px solid ${C.hairline};padding:30px 44px 34px;">
              <img src="${CHERRIES_MARK_URL}" alt="" width="22" height="26" style="display:block;width:22px;height:26px;margin:0 auto 14px;border:0;" />
              <p style="margin:0;font-family:${SANS};font-size:10px;font-weight:600;letter-spacing:0.24em;text-transform:uppercase;color:${C.ink};">
                {{{SALON_NAME}}}
              </p>
              <p style="margin:8px 0 0;font-family:${SANS};font-size:12px;line-height:1.6;color:${C.muted};">
                {{{ADDRESS}}}
              </p>
              <p style="margin:12px 0 0;font-family:${SANS};font-size:11px;letter-spacing:0.06em;color:${C.muted};">
                <span style="color:${C.cherry};font-weight:500;">{{{INSTAGRAM_HANDLE}}}</span>
                &nbsp;&nbsp;&middot;&nbsp;&nbsp;
                <a href="{{{SITE_URL}}}" style="color:${C.muted};text-decoration:none;border-bottom:1px solid ${C.hairline};">{{{SITE_URL}}}</a>
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

function renderLedger(rows) {
  const trs = rows
    .map(([label, value], i) => {
      const topBorder = i === 0 ? `border-top:1px solid ${C.ink};` : '';
      return `<tr>
                  <td style="${topBorder}border-bottom:1px solid ${C.hairline};padding:13px 12px 13px 0;font-family:${SANS};font-size:10px;font-weight:500;letter-spacing:0.18em;text-transform:uppercase;color:${C.muted};width:36%;vertical-align:top;">
                    ${label}
                  </td>
                  <td align="right" style="${topBorder}border-bottom:1px solid ${C.hairline};padding:13px 0;font-family:${SANS};font-size:14.5px;font-weight:500;line-height:1.45;color:${C.ink};vertical-align:top;">
                    ${value}
                  </td>
                </tr>`;
    })
    .join('\n');

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;">
                ${trs}
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
    html: renderEditorialShell({
      preheader: 'Apartamos tu espacio {{{BOOKING_CODE}}}. Realiza tu anticipo SPEI para confirmarlo.',
      metaRight: 'Nº {{{BOOKING_CODE}}}',
      kicker: 'SOLICITUD RECIBIDA · ANTICIPO PENDIENTE',
      headline: 'Apartamos tu espacio.',
      bodyHtml: `
              <p style="margin:0;font-family:${SANS};font-size:15px;line-height:1.78;color:${C.body};">
                Hola {{{CLIENT_NAME}}}, reservamos provisionalmente tu horario en el estudio. Para dejar tu cita confirmada, realiza tu transferencia SPEI y sube tu comprobante desde tu enlace personal.
              </p>
              ${renderLedger([
                ['Servicio', '{{{SERVICE_NAME}}}'],
                ['Especialista', '{{{STAFF_NAME}}}'],
                ['Fecha', '{{{DATE_LABEL}}}'],
                ['Horario', '{{{TIME_LABEL}}}'],
                ['Total estimado', '{{{TOTAL_LABEL}}}'],
              ])}
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.slipBg}" style="margin-top:28px;background-color:${C.slipBg};border-top:1px solid ${C.cherry};border-bottom:1px solid ${C.cherry};">
                <tr>
                  <td style="padding:22px 24px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="font-family:${SANS};font-size:10px;font-weight:600;letter-spacing:0.22em;text-transform:uppercase;color:${C.cherry};vertical-align:middle;">
                          Transferencia SPEI
                        </td>
                        <td align="right" style="font-family:${SERIF};font-size:22px;font-weight:400;color:${C.ink};vertical-align:middle;">
                          {{{DEPOSIT_LABEL}}}
                        </td>
                      </tr>
                    </table>
                    <p style="margin:14px 0 4px;font-family:${SANS};font-size:13.5px;line-height:1.6;color:${C.body};">
                      <span style="color:${C.muted};">Banco:</span> &nbsp;{{{BANK_NAME}}}
                    </p>
                    <p style="margin:0 0 14px;font-family:${SANS};font-size:13.5px;line-height:1.6;color:${C.body};">
                      <span style="color:${C.muted};">Titular:</span> &nbsp;{{{BENEFICIARY}}}
                    </p>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${C.hairline};">
                      <tr>
                        <td style="padding-top:14px;">
                          <p style="margin:0 0 4px;font-family:${SANS};font-size:9.5px;font-weight:500;letter-spacing:0.18em;text-transform:uppercase;color:${C.muted};">
                            CLABE interbancaria
                          </p>
                          <p style="margin:0;font-family:${MONO};font-size:16px;font-weight:600;letter-spacing:0.08em;color:${C.cherry};">
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

DETALLES
Servicio: {{{SERVICE_NAME}}}
Especialista: {{{STAFF_NAME}}}
Fecha: {{{DATE_LABEL}}}
Horario: {{{TIME_LABEL}}}
Total estimado: {{{TOTAL_LABEL}}}

TRANSFERENCIA SPEI — {{{DEPOSIT_LABEL}}}
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
    html: renderEditorialShell({
      preheader: 'Tu cita {{{BOOKING_CODE}}} de {{{SERVICE_NAME}}} con {{{STAFF_NAME}}} está confirmada.',
      metaRight: 'Nº {{{BOOKING_CODE}}}',
      heroImageUrl: EDITORIAL_HERO_URL,
      heroAlt: 'Manicure editorial cereza en LAIKONA NAILS BY KARLA',
      kicker: 'CITA CONFIRMADA',
      headline: 'Tu lugar está listo.',
      bodyHtml: `
              <p style="margin:0;font-family:${SANS};font-size:15px;line-height:1.78;color:${C.body};">
                Hola {{{CLIENT_NAME}}}, qué gusto recibirte pronto. Tu cita en <strong>{{{SALON_NAME}}}</strong> ha quedado confirmada y preparada especialmente para ti.
              </p>
              ${renderLedger([
                ['Servicio', '{{{SERVICE_NAME}}}'],
                ['Especialista', '{{{STAFF_NAME}}}'],
                ['Fecha', '{{{DATE_LABEL}}}'],
                ['Horario', '{{{TIME_LABEL}}}'],
                ['Total del servicio', '{{{TOTAL_LABEL}}}'],
              ])}
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;">
                <tr>
                  <td style="padding-bottom:10px;font-family:${SANS};font-size:10px;font-weight:600;letter-spacing:0.20em;text-transform:uppercase;color:${C.ink};">
                    Para tu visita
                  </td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-family:${SANS};font-size:13.5px;line-height:1.65;color:${C.body};">
                    <span style="color:${C.cherry};font-family:${SERIF};font-style:italic;padding-right:8px;">01</span>
                    Llega 5 a 10 minutos antes para comenzar con calma.
                  </td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-family:${SANS};font-size:13.5px;line-height:1.65;color:${C.body};">
                    <span style="color:${C.cherry};font-family:${SERIF};font-style:italic;padding-right:8px;">02</span>
                    Cuidamos cada set con 15 minutos máximos de tolerancia.
                  </td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-family:${SANS};font-size:13.5px;line-height:1.65;color:${C.body};">
                    <span style="color:${C.cherry};font-family:${SERIF};font-style:italic;padding-right:8px;">03</span>
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

Servicio: {{{SERVICE_NAME}}}
Especialista: {{{STAFF_NAME}}}
Fecha: {{{DATE_LABEL}}}
Horario: {{{TIME_LABEL}}}
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
    html: renderEditorialShell({
      preheader: 'Mañana tienes cita de {{{SERVICE_NAME}}} a las {{{TIME_LABEL}}} con {{{STAFF_NAME}}}.',
      metaRight: 'Nº {{{BOOKING_CODE}}}',
      kicker: 'RECORDATORIO · 24 HORAS',
      headline: 'Mañana te esperamos.',
      bodyHtml: `
              <p style="margin:0;font-family:${SANS};font-size:15px;line-height:1.78;color:${C.body};">
                Hola {{{CLIENT_NAME}}}, te compartimos los detalles de tu cita de mañana en el estudio. Si necesitas mover tu horario, puedes hacerlo directo desde tu enlace personal.
              </p>
              ${renderLedger([
                ['Servicio', '{{{SERVICE_NAME}}}'],
                ['Especialista', '{{{STAFF_NAME}}}'],
                ['Fecha', '{{{DATE_LABEL}}}'],
                ['Horario', '{{{TIME_LABEL}}}'],
                ['Ubicación', '{{{ADDRESS}}}'],
              ])}`,
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
Servicio: {{{SERVICE_NAME}}}
Especialista: {{{STAFF_NAME}}}
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
    html: renderEditorialShell({
      preheader: 'Hoy es tu cita a las {{{TIME_LABEL}}} con {{{STAFF_NAME}}} en {{{SALON_NAME}}}.',
      metaRight: 'Nº {{{BOOKING_CODE}}}',
      kicker: 'HOY EN EL ESTUDIO',
      headline: 'Nos vemos muy pronto.',
      bodyHtml: `
              <p style="margin:0;font-family:${SANS};font-size:15px;line-height:1.78;color:${C.body};">
                Hola {{{CLIENT_NAME}}}, tu mesa está por quedar lista. Te esperamos hoy en {{{SALON_NAME}}}:
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:26px;border-top:1px solid ${C.ink};border-bottom:1px solid ${C.hairline};">
                <tr>
                  <td align="center" style="padding:26px 12px;">
                    <p style="margin:0 0 6px;font-family:${SANS};font-size:10px;font-weight:500;letter-spacing:0.22em;text-transform:uppercase;color:${C.muted};">
                      Horario de hoy
                    </p>
                    <p style="margin:0;font-family:${SERIF};font-size:40px;font-weight:400;line-height:1.05;color:${C.cherry};">
                      {{{TIME_LABEL}}}
                    </p>
                    <p style="margin:12px 0 0;font-family:${SANS};font-size:14px;color:${C.ink};">
                      {{{SERVICE_NAME}}} &nbsp;&middot;&nbsp; con {{{STAFF_NAME}}}
                    </p>
                    <p style="margin:6px 0 0;font-family:${SANS};font-size:13px;color:${C.muted};">
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
    }),
    text: `LAIKONA NAILS BY KARLA · PUEBLA
HOY EN EL ESTUDIO · Nº {{{BOOKING_CODE}}}

Nos vemos muy pronto — {{{TIME_LABEL}}}

Hola {{{CLIENT_NAME}}},
Te esperamos hoy en {{{SALON_NAME}}}:
Horario: {{{TIME_LABEL}}}
Servicio: {{{SERVICE_NAME}}}
Especialista: {{{STAFF_NAME}}}
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
    html: renderEditorialShell({
      preheader: 'Actualizamos tu cita {{{BOOKING_CODE}}} al {{{DATE_LABEL}}} a las {{{TIME_LABEL}}}.',
      metaRight: 'Nº {{{BOOKING_CODE}}}',
      kicker: 'CAMBIO DE HORARIO',
      headline: 'Actualizamos tu cita.',
      bodyHtml: `
              <p style="margin:0;font-family:${SANS};font-size:15px;line-height:1.78;color:${C.body};">
                Hola {{{CLIENT_NAME}}}, guardamos tu nueva fecha sin problema. Estos son los datos actualizados de tu próxima visita:
              </p>
              ${renderLedger([
                ['Nueva fecha', '{{{DATE_LABEL}}}'],
                ['Nuevo horario', '{{{TIME_LABEL}}}'],
                ['Servicio', '{{{SERVICE_NAME}}}'],
                ['Especialista', '{{{STAFF_NAME}}}'],
              ])}`,
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
Especialista: {{{STAFF_NAME}}}

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
    html: renderEditorialShell({
      preheader: 'Confirmamos la cancelación de tu cita {{{BOOKING_CODE}}} en {{{SALON_NAME}}}.',
      metaRight: 'Nº {{{BOOKING_CODE}}}',
      kicker: 'CONFIRMACIÓN DE CANCELACIÓN',
      headline: 'Tu cita ha sido cancelada.',
      bodyHtml: `
              <p style="margin:0;font-family:${SANS};font-size:15px;line-height:1.78;color:${C.body};">
                Hola {{{CLIENT_NAME}}}, liberamos tu espacio en agenda tal como se solicitó. Cuando desees agendar de nuevo, estaremos encantadas de recibirte.
              </p>
              ${renderLedger([
                ['Servicio', '{{{SERVICE_NAME}}}'],
                ['Especialista', '{{{STAFF_NAME}}}'],
                ['Fecha original', '{{{DATE_LABEL}}} · {{{TIME_LABEL}}}'],
                ['Observación', '{{{CANCELLATION_NOTE}}}'],
              ])}`,
      primaryCta: {
        label: 'Agendar una nueva fecha',
        href: '{{{BOOKING_URL}}}',
      },
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
Especialista: {{{STAFF_NAME}}}
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
    html: renderEditorialShell({
      preheader: 'Ya casi cumplen 3 semanas tus uñas. Aparta tu retoque en {{{SALON_NAME}}}.',
      metaRight: 'CUIDADO · 3 SEMANAS',
      heroImageUrl: EDITORIAL_HERO_URL,
      heroAlt: 'Set editorial cereza en LAIKONA NAILS BY KARLA',
      kicker: 'RITUAL DE MANTENIMIENTO',
      headline: 'Tres semanas después.',
      bodyHtml: `
              <p style="margin:0;font-family:${SANS};font-size:15px;line-height:1.78;color:${C.body};">
                Hola {{{CLIENT_NAME}}}, ya casi cumplen tres semanas desde tu último servicio de <strong>{{{SERVICE_NAME}}}</strong> con {{{STAFF_NAME}}}. Renovar tu set a tiempo mantiene tu uña natural fuerte, ligera y con estructura impecable.
              </p>
              <p style="margin:18px 0 0;font-family:${SERIF};font-style:italic;font-size:17px;line-height:1.6;color:${C.ink};">
                “El secreto de unas uñas que siempre se ven impecables está en el retoque a tiempo.”
              </p>`,
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
Ya casi cumplen tres semanas desde tu último servicio de {{{SERVICE_NAME}}} con {{{STAFF_NAME}}}. Renovar tu set a tiempo mantiene tu uña natural fuerte y con estructura impecable.

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
    html: renderEditorialShell({
      preheader: 'Tienes {{{TTL_MINUTES}}} minutos de prioridad para apartar el espacio del {{{DATE_LABEL}}}.',
      metaRight: 'PRIORIDAD · {{{TTL_MINUTES}}} MIN',
      heroImageUrl: EDITORIAL_HERO_URL,
      heroAlt: 'Espacio disponible en LAIKONA NAILS BY KARLA',
      kicker: 'LISTA DE ESPERA · ACCESO PRIORITARIO',
      headline: 'Se abrió un lugar para ti.',
      bodyHtml: `
              <p style="margin:0;font-family:${SANS};font-size:15px;line-height:1.78;color:${C.body};">
                Hola {{{CLIENT_NAME}}}, acaba de liberarse un espacio que coincide con tu solicitud en el estudio. Lo mantenemos reservado de forma prioritaria para ti durante los próximos <strong>{{{TTL_MINUTES}}} minutos</strong>.
              </p>
              ${renderLedger([
                ['Servicio', '{{{SERVICE_NAME}}}'],
                ['Especialista', '{{{STAFF_NAME}}}'],
                ['Fecha', '{{{DATE_LABEL}}}'],
                ['Horario libre', '{{{TIME_LABEL}}}'],
              ])}`,
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
Especialista: {{{STAFF_NAME}}}
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
    html: renderEditorialShell({
      preheader: 'Tu código privado de {{{SALON_NAME}}} es {{{OTP_CODE}}}. Válido por {{{EXPIRES_MINUTES}}} minutos.',
      metaRight: 'ACCESO PRIVADO',
      kicker: 'PORTAL MIS CITAS',
      headline: 'Tu código de verificación.',
      bodyHtml: `
              <p style="margin:0;font-family:${SANS};font-size:15px;line-height:1.78;color:${C.body};">
                Hola {{{CLIENT_NAME}}}, ingresa este código de un solo uso para consultar tus próximas citas, historial y sellos de fidelidad:
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;border-top:1px solid ${C.ink};border-bottom:1px solid ${C.hairline};">
                <tr>
                  <td align="center" style="padding:30px 12px;">
                    <p class="lk-otp" style="margin:0;font-family:${MONO};font-size:38px;font-weight:500;letter-spacing:12px;color:${C.cherry};padding-left:12px;">
                      {{{OTP_CODE}}}
                    </p>
                    <p style="margin:14px 0 0;font-family:${SANS};font-size:10px;font-weight:500;letter-spacing:0.20em;text-transform:uppercase;color:${C.muted};">
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
    html: renderEditorialShell({
      preheader: '{{{ALERT_HEADING}}} ({{{BOOKING_CODE}}}) — {{{CLIENT_NAME}}}.',
      metaLeft: 'DESPACHO ADMINISTRATIVO',
      metaRight: 'Nº {{{BOOKING_CODE}}}',
      wordmarkTone: 'ink',
      topRuleColor: C.ink,
      kicker: '{{{ALERT_BADGE}}}',
      headline: '{{{ALERT_HEADING}}}',
      bodyHtml: `
              <p style="margin:0;font-family:${SANS};font-size:15px;line-height:1.78;color:${C.body};">
                {{{ALERT_DETAIL}}}
              </p>
              ${renderLedger([
                ['Clienta', '{{{CLIENT_NAME}}}'],
                ['WhatsApp', '{{{CLIENT_PHONE}}}'],
                ['Servicio', '{{{SERVICE_NAME}}}'],
                ['Especialista', '{{{STAFF_NAME}}}'],
                ['Fecha y hora', '{{{DATE_LABEL}}} · {{{TIME_LABEL}}}'],
              ])}`,
      primaryCta: {
        label: 'Abrir agenda en Admin',
        href: '{{{ADMIN_URL}}}',
      },
    }),
    text: `LAIKONA NAILS · DESPACHO ADMINISTRATIVO
{{{ALERT_BADGE}}} · Nº {{{BOOKING_CODE}}}

{{{ALERT_HEADING}}}
{{{ALERT_DETAIL}}}

Clienta: {{{CLIENT_NAME}}} ({{{CLIENT_PHONE}}})
Servicio: {{{SERVICE_NAME}}}
Especialista: {{{STAFF_NAME}}}
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
    html: renderEditorialShell({
      preheader: 'Respalda {{{ASSETS_COUNT}}} archivo(s) antes de su purga automática en {{{STAGE_LABEL}}}.',
      metaLeft: 'RESPALDO CONTABLE',
      metaRight: 'VENTANA · {{{STAGE_LABEL}}}',
      wordmarkTone: 'ink',
      topRuleColor: C.ink,
      kicker: 'RETENCIÓN ANUAL DE ARCHIVOS',
      headline: '{{{HEADING_TEXT}}}',
      bodyHtml: `
              <p style="margin:0;font-family:${SANS};font-size:15px;line-height:1.78;color:${C.body};">
                {{{INTRO_TEXT}}}
              </p>
              ${renderLedger([
                ['Archivos en lote', '{{{ASSETS_COUNT}}}'],
                ['Comprobantes SPEI', '{{{PROOFS_COUNT}}}'],
                ['Fotos de referencia', '{{{INSPO_COUNT}}}'],
                ['Peso total', '{{{TOTAL_SIZE}}}'],
              ])}
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.slipBg}" style="margin-top:24px;background-color:${C.slipBg};border-top:1px solid ${C.hairline};border-bottom:1px solid ${C.hairline};">
                <tr>
                  <td style="padding:16px 18px;">
                    <p style="margin:0 0 8px;font-family:${SANS};font-size:9.5px;font-weight:600;letter-spacing:0.20em;text-transform:uppercase;color:${C.muted};">
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
  for (const item of existingRes.data ?? []) {
    if (item.alias) existingByAlias.set(item.alias, item);
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'laikona-resend-tpl-'));
  const summary = [];

  try {
    for (const tpl of RESEND_TEMPLATES) {
      const htmlPath = path.join(tmpDir, `${tpl.alias}.html`);
      const textPath = path.join(tmpDir, `${tpl.alias}.txt`);
      fs.writeFileSync(htmlPath, tpl.html, 'utf8');
      fs.writeFileSync(textPath, tpl.text, 'utf8');

      const existing = existingByAlias.get(tpl.alias);
      const commonArgs = [
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
          '--alias',
          tpl.alias,
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

if (process.argv.includes('--preview-dir')) {
  const dirIdx = process.argv.indexOf('--preview-dir');
  const outDir = process.argv[dirIdx + 1];
  if (!outDir) throw new Error('Missing --preview-dir path');
  fs.mkdirSync(outDir, { recursive: true });
  const localAssets = process.argv.includes('--local-assets');
  for (const tpl of RESEND_TEMPLATES) {
    let preview = tpl.html;
    for (const v of tpl.variables) {
      preview = preview.split(`{{{${v.key}}}}`).join(String(v.fallback));
    }
    if (localAssets) {
      const publicBrandUri = `file:///${path.resolve('public/brand').replace(/\\/g, '/')}`;
      preview = preview.split('https://laikona.devand.net/brand').join(publicBrandUri);
    }
    fs.writeFileSync(path.join(outDir, `${tpl.alias}.html`), preview, 'utf8');
  }
  console.log(`Wrote ${RESEND_TEMPLATES.length} HTML previews to ${outDir}`);
} else {
  syncAllTemplates();
}
