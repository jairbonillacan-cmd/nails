import fs from 'node:fs';
import path from 'node:path';

const GRAPH_VERSION = 'v21.0';

const CANONICAL_TEMPLATES = [
  {
    triggerKey: 'booking_confirmed',
    name: 'laikona_cita_confirmada',
    category: 'UTILITY',
    language: 'es_MX',
    bodyText:
      'Hola {{1}}, tu cita de {{2}} en LAIKONA NAILS quedó confirmada para el {{3}} a las {{4}} con {{5}}. Consulta detalles, ubicación o cambios aquí: {{6}}',
    examples: [
      'Sofía',
      'Rubber',
      'viernes 27 de noviembre',
      '10:00 a.m.',
      'Karla',
      'https://laikona.devand.net/cita/demo',
    ],
  },
  {
    triggerKey: 'reminder_24h',
    name: 'laikona_recordatorio_24h',
    category: 'UTILITY',
    language: 'es_MX',
    bodyText:
      'Hola {{1}}, te recordamos tu cita mañana en LAIKONA NAILS: {{2}} a las {{3}} con {{4}}. Si necesitas mover tu horario hazlo aquí: {{5}}',
    examples: [
      'Sofía',
      'Rubber',
      '10:00 a.m.',
      'Karla',
      'https://laikona.devand.net/cita/demo',
    ],
    quickReplyButtons: ['Confirmo', 'Necesito reagendar'],
  },
  {
    triggerKey: 'reminder_2h',
    name: 'laikona_recordatorio_2h',
    category: 'UTILITY',
    language: 'es_MX',
    bodyText:
      'Hola {{1}}, ¡nos vemos muy pronto! Tu cita es hoy a las {{2}} en {{3}}. Te esperamos con 15 minutos máximos de tolerancia.',
    examples: ['Sofía', '10:00 a.m.', 'Blvd. Héroes del 5 de Mayo, Puebla, Pue.'],
  },
  {
    triggerKey: 'booking_rescheduled',
    name: 'laikona_cita_reagendada',
    category: 'UTILITY',
    language: 'es_MX',
    bodyText:
      'Hola {{1}}, actualizamos tu cita de {{2}} en LAIKONA NAILS para el {{3}} a las {{4}}. Aquí tienes tu enlace actualizado: {{5}}',
    examples: [
      'Sofía',
      'Rubber',
      'sábado 28 de noviembre',
      '1:30 p.m.',
      'https://laikona.devand.net/cita/demo',
    ],
  },
  {
    triggerKey: 'booking_canceled',
    name: 'laikona_cita_cancelada',
    category: 'UTILITY',
    language: 'es_MX',
    bodyText:
      'Hola {{1}}, confirmamos la cancelación de tu cita de {{2}} del {{3}} en LAIKONA NAILS. Tu espacio quedó liberado y cuando gustes puedes volver a agendar.',
    examples: ['Sofía', 'Rubber', 'viernes 27 de noviembre'],
  },
  {
    triggerKey: 'waitlist_offer',
    name: 'laikona_lista_espera',
    category: 'UTILITY',
    language: 'es_MX',
    bodyText:
      'Hola {{1}}, se liberó un espacio en LAIKONA NAILS para {{2}} el {{3}} a las {{4}}. Apártalo con prioridad antes de que se ocupe aquí: {{5}}',
    examples: [
      'Sofía',
      'Rubber',
      'viernes 27 de noviembre',
      '1:30 p.m.',
      'https://laikona.devand.net/reservar/rubber',
    ],
  },
  {
    triggerKey: 'deposit_rejected',
    name: 'laikona_comprobante_rechazado',
    category: 'UTILITY',
    language: 'es_MX',
    bodyText:
      'Hola {{1}}, no pudimos validar el comprobante de anticipo de tu cita {{2}} ({{3}}) en LAIKONA NAILS. Tu horario sigue apartado mientras subes uno nuevo aquí: {{4}}',
    examples: ['Sofía', 'NL-1042', 'Rubber', 'https://laikona.devand.net/cita/demo'],
  },
  {
    triggerKey: 'client_otp',
    name: 'laikona_codigo_acceso',
    category: 'AUTHENTICATION',
    language: 'es_MX',
    otpExpirationMinutes: 5,
    otpButtonText: 'Copiar código',
  },
  {
    triggerKey: 'touchup_invite',
    name: 'laikona_invitacion_retoque',
    category: 'MARKETING',
    language: 'es_MX',
    bodyText:
      'Hola {{1}}, ya casi cumplen 3 semanas tus uñas de {{2}} con {{3}} en LAIKONA NAILS. Aparta tu retoque en un toque aquí: {{4}}',
    examples: ['Sofía', 'Rubber', 'Karla', 'https://laikona.devand.net/reservar/rubber'],
  },
];

function loadLocalEnvFiles() {
  const candidates = ['.env.production.local', '.env.local', '.env'];
  for (const filename of candidates) {
    const fullPath = path.join(process.cwd(), filename);
    if (!fs.existsSync(fullPath)) continue;
    const raw = fs.readFileSync(fullPath, 'utf-8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env) && val) {
        process.env[key] = val;
      }
    }
  }
}

function buildPayload(spec) {
  if (spec.category === 'AUTHENTICATION') {
    return {
      name: spec.name,
      language: spec.language,
      category: 'AUTHENTICATION',
      components: [
        { type: 'BODY', add_security_recommendation: true },
        { type: 'FOOTER', code_expiration_minutes: spec.otpExpirationMinutes ?? 5 },
        {
          type: 'BUTTONS',
          buttons: [
            {
              type: 'OTP',
              otp_type: 'COPY_CODE',
              text: spec.otpButtonText ?? 'Copiar código',
            },
          ],
        },
      ],
    };
  }

  const components = [
    {
      type: 'BODY',
      text: spec.bodyText,
      example: { body_text: [spec.examples] },
    },
  ];
  if (spec.quickReplyButtons && spec.quickReplyButtons.length > 0) {
    components.push({
      type: 'BUTTONS',
      buttons: spec.quickReplyButtons.map((text) => ({ type: 'QUICK_REPLY', text })),
    });
  }
  return {
    name: spec.name,
    language: spec.language,
    category: spec.category,
    components,
  };
}

async function main() {
  loadLocalEnvFiles();
  const apply = process.argv.includes('--apply');
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim();
  const appSecret = process.env.WHATSAPP_APP_SECRET?.trim();
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN?.trim();

  console.log('\n[whatsapp] Diagnóstico de variables de entorno:');
  console.log(`  WHATSAPP_ACCESS_TOKEN:        ${token ? 'OK' : 'FALTA'}`);
  console.log(`  WHATSAPP_PHONE_NUMBER_ID:     ${phoneId ? 'OK' : 'FALTA'}`);
  console.log(`  WHATSAPP_BUSINESS_ACCOUNT_ID: ${wabaId ? 'OK' : 'FALTA'}`);
  console.log(`  WHATSAPP_APP_SECRET:          ${appSecret ? 'OK' : 'FALTA'}`);
  console.log(`  WHATSAPP_VERIFY_TOKEN:        ${verifyToken ? 'OK' : 'FALTA'}`);
  console.log(`  WHATSAPP_COEXISTENCE_ENABLED: ${process.env.WHATSAPP_COEXISTENCE_ENABLED || 'false'}`);

  if (!token || !wabaId) {
    console.log('\n[whatsapp] Aún faltan credenciales de Meta para consultar/sincronizar.');
    console.log('Cuando tengas tu App de Meta + WhatsApp Coexistence lista, configura esos secretos y vuelve a correr:');
    console.log('  npm run whatsapp:check');
    console.log('  npm run whatsapp:sync-templates\n');
    return;
  }

  if (phoneId) {
    const phoneRes = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(phoneId)}?fields=display_phone_number,verified_name,quality_rating,status`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const phoneJson = await phoneRes.json().catch(() => ({}));
    if (phoneRes.ok) {
      console.log('\n[whatsapp] Número conectado en Meta:');
      console.log(`  Número:   ${phoneJson.display_phone_number || '-'}`);
      console.log(`  Nombre:   ${phoneJson.verified_name || '-'}`);
      console.log(`  Calidad:  ${phoneJson.quality_rating || '-'}`);
      console.log(`  Estado:   ${phoneJson.status || '-'}`);
    } else {
      console.error(`\n[whatsapp] Error consultando número: ${phoneJson.error?.message || phoneRes.status}`);
    }
  }

  const listRes = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(wabaId)}/message_templates?fields=id,name,status,category,language,rejected_reason&limit=100`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const listJson = await listRes.json().catch(() => ({}));
  if (!listRes.ok) {
    console.error(`\n[whatsapp] Error listando plantillas: ${listJson.error?.message || listRes.status}`);
    process.exit(1);
  }

  const remoteByName = new Map();
  for (const row of listJson.data ?? []) {
    if (row.name && (!remoteByName.has(row.name) || row.language === 'es_MX')) {
      remoteByName.set(row.name, row);
    }
  }

  console.log('\n[whatsapp] Estado de las 9 plantillas oficiales (es_MX):');
  let missingCount = 0;
  for (const spec of CANONICAL_TEMPLATES) {
    const remote = remoteByName.get(spec.name);
    if (remote) {
      console.log(
        `  [OK] ${spec.name} (${spec.category}) -> ${remote.status}${remote.rejected_reason ? ` (${remote.rejected_reason})` : ''}`,
      );
      continue;
    }
    missingCount += 1;
    if (!apply) {
      console.log(`  [FALTA] ${spec.name} (${spec.category})`);
      continue;
    }

    const createRes = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(wabaId)}/message_templates`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildPayload(spec)),
      },
    );
    const createJson = await createRes.json().catch(() => ({}));
    if (createRes.ok) {
      console.log(`  [CREADA] ${spec.name} -> id=${createJson.id ?? 'ok'} (en revisión por Meta)`);
    } else {
      console.error(
        `  [ERROR] ${spec.name}: ${createJson.error?.error_user_msg || createJson.error?.message || createRes.status}`,
      );
    }
  }

  if (!apply && missingCount > 0) {
    console.log(`\nFaltan ${missingCount} plantilla(s) en Meta. Ejecuta "npm run whatsapp:sync-templates" para crearlas.`);
  }
  console.log('');
}

void main();
