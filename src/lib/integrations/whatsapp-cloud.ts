import { isWhatsAppCoexistenceEnabled } from '../env';
import { normalizePhoneE164 } from '../format';
import { logWarn } from '../logger';
import type { WhatsAppTemplateConfig, WhatsAppTemplateTriggerKey } from '../types';
import { dispatchWhatsAppNotification, type NotificationDispatchResult } from './notifications';
import {
  buildMetaTemplateCreationPayload,
  getOfficialWhatsAppTemplateSpec,
  OFFICIAL_WHATSAPP_TEMPLATES,
  WHATSAPP_GRAPH_API_VERSION,
} from './whatsapp-templates';

const META_HTTP_TIMEOUT_MS = 9_000;

function createMetaSignal(timeoutMs = META_HTTP_TIMEOUT_MS): AbortSignal | undefined {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(timeoutMs);
  }
  return undefined;
}

export interface WhatsAppReadinessReport {
  graphApiVersion: string;
  webhookUrl: string;
  requiredWebhookFields: readonly ['messages', 'statuses', 'smb_message_echoes'];
  accessTokenConfigured: boolean;
  phoneNumberIdConfigured: boolean;
  businessAccountIdConfigured: boolean;
  appSecretConfigured: boolean;
  verifyTokenConfigured: boolean;
  flowIdConfigured: boolean;
  coexistenceEnabled: boolean;
  cloudReady: boolean;
  webhookReady: boolean;
  managementReady: boolean;
  missingVars: string[];
}

interface MetaPhoneHealthInfo {
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  qualityRating: string | null;
  status: string | null;
}

interface MetaRemoteTemplateStatus {
  triggerKey: WhatsAppTemplateTriggerKey;
  templateName: string;
  metaId: string | null;
  status: 'APPROVED' | 'PENDING' | 'REJECTED' | 'PAUSED' | 'MISSING' | 'UNKNOWN';
  category: string | null;
  rejectedReason: string | null;
}

export interface MetaWhatsAppLiveStatus {
  ok: boolean;
  checkedAt: string;
  phone: MetaPhoneHealthInfo | null;
  templates: MetaRemoteTemplateStatus[];
  error: string | null;
}

export interface MetaTemplateSyncReport {
  ok: boolean;
  created: Array<{ triggerKey: WhatsAppTemplateTriggerKey; templateName: string; metaId: string | null }>;
  existing: Array<{ triggerKey: WhatsAppTemplateTriggerKey; templateName: string; status: string }>;
  failed: Array<{ triggerKey: WhatsAppTemplateTriggerKey; templateName: string; error: string }>;
  error: string | null;
}

export function getWhatsAppReadinessReport(
  appUrl: string,
  raw: Record<string, string | undefined> = process.env,
): WhatsAppReadinessReport {
  const accessTokenConfigured = Boolean(raw.WHATSAPP_ACCESS_TOKEN?.trim());
  const phoneNumberIdConfigured = Boolean(raw.WHATSAPP_PHONE_NUMBER_ID?.trim());
  const businessAccountIdConfigured = Boolean(raw.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim());
  const appSecretConfigured = Boolean(raw.WHATSAPP_APP_SECRET?.trim());
  const verifyTokenConfigured = Boolean(raw.WHATSAPP_VERIFY_TOKEN?.trim());
  const flowIdConfigured = Boolean(raw.WHATSAPP_FLOW_ID?.trim());
  const coexistenceEnabled = isWhatsAppCoexistenceEnabled(raw);

  const missingVars: string[] = [];
  if (!accessTokenConfigured) missingVars.push('WHATSAPP_ACCESS_TOKEN');
  if (!phoneNumberIdConfigured) missingVars.push('WHATSAPP_PHONE_NUMBER_ID');
  if (!businessAccountIdConfigured) missingVars.push('WHATSAPP_BUSINESS_ACCOUNT_ID');
  if (!appSecretConfigured) missingVars.push('WHATSAPP_APP_SECRET');
  if (!verifyTokenConfigured) missingVars.push('WHATSAPP_VERIFY_TOKEN');

  const normalizedUrl = appUrl.replace(/\/+$/, '');
  return {
    graphApiVersion: WHATSAPP_GRAPH_API_VERSION,
    webhookUrl: `${normalizedUrl}/api/webhooks/whatsapp`,
    requiredWebhookFields: ['messages', 'statuses', 'smb_message_echoes'],
    accessTokenConfigured,
    phoneNumberIdConfigured,
    businessAccountIdConfigured,
    appSecretConfigured,
    verifyTokenConfigured,
    flowIdConfigured,
    coexistenceEnabled,
    cloudReady: accessTokenConfigured && phoneNumberIdConfigured,
    webhookReady: appSecretConfigured && verifyTokenConfigured,
    managementReady: accessTokenConfigured && businessAccountIdConfigured,
    missingVars,
  };
}

function normalizeMetaTemplateStatus(
  raw: string | undefined,
): MetaRemoteTemplateStatus['status'] {
  const upper = (raw ?? '').trim().toUpperCase();
  if (upper === 'APPROVED') return 'APPROVED';
  if (upper === 'PENDING' || upper === 'IN_APPEAL') return 'PENDING';
  if (upper === 'REJECTED') return 'REJECTED';
  if (upper === 'PAUSED' || upper === 'DISABLED') return 'PAUSED';
  return 'UNKNOWN';
}

interface RawMetaTemplateRow {
  id?: string;
  name?: string;
  status?: string;
  category?: string;
  language?: string;
  rejected_reason?: string;
}

async function fetchMetaTemplatesList(
  wabaId: string,
  token: string,
  fetcher: typeof fetch,
): Promise<{ rows: RawMetaTemplateRow[]; error: string | null }> {
  try {
    const res = await fetcher(
      `https://graph.facebook.com/${WHATSAPP_GRAPH_API_VERSION}/${encodeURIComponent(wabaId)}/message_templates?fields=id,name,status,category,language,rejected_reason&limit=100`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        signal: createMetaSignal(),
      },
    );
    const json = (await res.json().catch(() => ({}))) as {
      data?: RawMetaTemplateRow[];
      error?: { message?: string };
    };
    if (!res.ok) {
      return {
        rows: [],
        error: json.error?.message || `Meta Graph API HTTP ${res.status}`,
      };
    }
    return { rows: json.data ?? [], error: null };
  } catch (err) {
    return {
      rows: [],
      error: err instanceof Error ? err.message : 'No se pudo consultar Meta Graph API.',
    };
  }
}

export async function fetchMetaWhatsAppStatus(params: {
  configuredTemplates: readonly WhatsAppTemplateConfig[];
  fetchImpl?: typeof fetch;
}): Promise<MetaWhatsAppLiveStatus> {
  const checkedAt = new Date().toISOString();
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim();
  const fetcher = params.fetchImpl ?? globalThis.fetch;

  if (!token || !phoneId) {
    return {
      ok: false,
      checkedAt,
      phone: null,
      templates: [],
      error: 'Faltan WHATSAPP_ACCESS_TOKEN o WHATSAPP_PHONE_NUMBER_ID para comprobar la conexión.',
    };
  }

  let phone: MetaPhoneHealthInfo | null = null;
  let phoneError: string | null = null;
  try {
    const phoneRes = await fetcher(
      `https://graph.facebook.com/${WHATSAPP_GRAPH_API_VERSION}/${encodeURIComponent(phoneId)}?fields=display_phone_number,verified_name,quality_rating,status`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        signal: createMetaSignal(),
      },
    );
    const phoneJson = (await phoneRes.json().catch(() => ({}))) as {
      display_phone_number?: string;
      verified_name?: string;
      quality_rating?: string;
      status?: string;
      error?: { message?: string };
    };
    if (!phoneRes.ok) {
      phoneError = phoneJson.error?.message || `Meta Graph API HTTP ${phoneRes.status}`;
    } else {
      phone = {
        displayPhoneNumber: phoneJson.display_phone_number ?? null,
        verifiedName: phoneJson.verified_name ?? null,
        qualityRating: phoneJson.quality_rating ?? null,
        status: phoneJson.status ?? null,
      };
    }
  } catch (err) {
    phoneError = err instanceof Error ? err.message : 'No se pudo conectar con Meta.';
  }

  const remoteByName = new Map<string, RawMetaTemplateRow>();
  let templatesError: string | null = null;
  if (wabaId) {
    const listRes = await fetchMetaTemplatesList(wabaId, token, fetcher);
    templatesError = listRes.error;
    for (const row of listRes.rows) {
      if (!row.name) continue;
      const existing = remoteByName.get(row.name);
      if (!existing || row.language === 'es_MX') {
        remoteByName.set(row.name, row);
      }
    }
  }

  const configuredByTrigger = new Map(
    params.configuredTemplates.map((tpl) => [tpl.triggerKey, tpl]),
  );
  const templates: MetaRemoteTemplateStatus[] = OFFICIAL_WHATSAPP_TEMPLATES.map((spec) => {
    const configured = configuredByTrigger.get(spec.triggerKey);
    const expectedName = configured?.templateName ?? spec.defaultTemplateName;
    const remote = remoteByName.get(expectedName);
    if (!wabaId || templatesError) {
      return {
        triggerKey: spec.triggerKey,
        templateName: expectedName,
        metaId: null,
        status: 'UNKNOWN',
        category: spec.category,
        rejectedReason: null,
      };
    }
    if (!remote) {
      return {
        triggerKey: spec.triggerKey,
        templateName: expectedName,
        metaId: null,
        status: 'MISSING',
        category: spec.category,
        rejectedReason: null,
      };
    }
    return {
      triggerKey: spec.triggerKey,
      templateName: expectedName,
      metaId: remote.id ?? null,
      status: normalizeMetaTemplateStatus(remote.status),
      category: remote.category ?? spec.category,
      rejectedReason: remote.rejected_reason ?? null,
    };
  });

  const combinedError = phoneError || templatesError;
  return {
    ok: !phoneError && Boolean(phone),
    checkedAt,
    phone,
    templates,
    error: combinedError,
  };
}

export async function syncOfficialTemplatesToMeta(params: {
  configuredTemplates: readonly WhatsAppTemplateConfig[];
  fetchImpl?: typeof fetch;
}): Promise<MetaTemplateSyncReport> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim();
  const fetcher = params.fetchImpl ?? globalThis.fetch;

  if (!token || !wabaId) {
    return {
      ok: false,
      created: [],
      existing: [],
      failed: [],
      error:
        'Se requieren WHATSAPP_ACCESS_TOKEN y WHATSAPP_BUSINESS_ACCOUNT_ID para sincronizar plantillas con Meta.',
    };
  }

  const existingList = await fetchMetaTemplatesList(wabaId, token, fetcher);
  if (existingList.error) {
    return {
      ok: false,
      created: [],
      existing: [],
      failed: [],
      error: existingList.error,
    };
  }

  const remoteByName = new Map<string, RawMetaTemplateRow>();
  for (const row of existingList.rows) {
    if (row.name && (!remoteByName.has(row.name) || row.language === 'es_MX')) {
      remoteByName.set(row.name, row);
    }
  }

  const configuredByTrigger = new Map(
    params.configuredTemplates.map((tpl) => [tpl.triggerKey, tpl]),
  );

  const created: MetaTemplateSyncReport['created'] = [];
  const existing: MetaTemplateSyncReport['existing'] = [];
  const failed: MetaTemplateSyncReport['failed'] = [];

  for (const spec of OFFICIAL_WHATSAPP_TEMPLATES) {
    const configured = configuredByTrigger.get(spec.triggerKey);
    const targetName = configured?.templateName ?? spec.defaultTemplateName;
    const remote = remoteByName.get(targetName);
    if (remote) {
      existing.push({
        triggerKey: spec.triggerKey,
        templateName: targetName,
        status: normalizeMetaTemplateStatus(remote.status),
      });
      continue;
    }

    const creationPayload = buildMetaTemplateCreationPayload(spec, targetName);
    try {
      const res = await fetcher(
        `https://graph.facebook.com/${WHATSAPP_GRAPH_API_VERSION}/${encodeURIComponent(wabaId)}/message_templates`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          signal: createMetaSignal(),
          body: JSON.stringify(creationPayload),
        },
      );
      const json = (await res.json().catch(() => ({}))) as {
        id?: string;
        error?: { message?: string; error_user_msg?: string };
      };
      if (!res.ok) {
        const msg =
          json.error?.error_user_msg ||
          json.error?.message ||
          `Meta Graph API HTTP ${res.status}`;
        logWarn('whatsapp_meta_template_create_failed', {
          triggerKey: spec.triggerKey,
          templateName: targetName,
          error: msg,
        });
        failed.push({ triggerKey: spec.triggerKey, templateName: targetName, error: msg });
      } else {
        created.push({
          triggerKey: spec.triggerKey,
          templateName: targetName,
          metaId: json.id ?? null,
        });
      }
    } catch (err) {
      failed.push({
        triggerKey: spec.triggerKey,
        templateName: targetName,
        error: err instanceof Error ? err.message : 'Error de red enviando plantilla a Meta.',
      });
    }
  }

  return {
    ok: failed.length === 0,
    created,
    existing,
    failed,
    error: failed.length > 0 ? `${failed.length} plantilla(s) no se pudieron crear en Meta.` : null,
  };
}

export async function sendWhatsAppLiveTestMessage(params: {
  toPhone: string;
  salonName: string;
  salonAddress: string;
  appUrl: string;
  timezone: string;
  fetchImpl?: typeof fetch;
}): Promise<NotificationDispatchResult & { normalizedPhone: string }> {
  const normalizedPhone = normalizePhoneE164(params.toPhone);
  const spec = getOfficialWhatsAppTemplateSpec('reminder_2h');
  const bodyText = `Hola, esta es una prueba de conexión de WhatsApp Business para ${params.salonName} (${params.salonAddress}).`;

  const result = await dispatchWhatsAppNotification({
    toPhoneE164: normalizedPhone,
    bodyText,
    triggerKey: spec.triggerKey,
    templateParameters: [
      params.salonName,
      '10:00 a.m.',
      params.salonAddress || 'Puebla, México',
    ],
    withinServiceWindow: false,
    settingsTimezone: params.timezone,
    fetchImpl: params.fetchImpl,
  });

  return {
    ...result,
    normalizedPhone,
  };
}
