import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminSession, requireAdmin } from '@/lib/auth/admin-session';
import {
  WhatsAppSettingsActionSchema,
  type WhatsAppSettingsResponseDTO,
} from '@/lib/contracts';
import { getRuntimeIntegrationStatus } from '@/lib/env';
import {
  fetchMetaWhatsAppStatus,
  getWhatsAppReadinessReport,
  sendWhatsAppLiveTestMessage,
  syncOfficialTemplatesToMeta,
} from '@/lib/integrations/whatsapp-cloud';
import { getWhatsAppMonthKey } from '@/lib/integrations/whatsapp-templates';
import { WHATSAPP_TEMPLATE_CATALOG } from '@/lib/notifications/whatsapp-inbox';
import { toAdminSettingsDTO } from '@/lib/public-dto';
import { getRepository } from '@/lib/repositories/db';
import { isSupabaseEnabled } from '@/lib/repositories/supabase-client';
import { checkRateLimit, getRequestIp } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

const PRIVATE_NO_STORE = { 'Cache-Control': 'private, no-store' } as const;

function isWhatsAppSimulatorAllowed(): boolean {
  if (process.env.WHATSAPP_SIMULATOR_ENABLED === 'false') {
    return false;
  }
  return (
    !isSupabaseEnabled() ||
    process.env.NODE_ENV !== 'production' ||
    process.env.WHATSAPP_SIMULATOR_ENABLED === 'true'
  );
}

export async function GET(request: NextRequest) {
  const session = await requireAdmin(['owner', 'admin'], request);
  if (!session) {
    const authenticated = await getAdminSession(request);
    return NextResponse.json(
      {
        error: authenticated
          ? 'No tienes permisos para consultar la configuración de WhatsApp.'
          : 'No autorizado',
      },
      { status: authenticated ? 403 : 401, headers: PRIVATE_NO_STORE },
    );
  }

  const env = getRuntimeIntegrationStatus();
  const repo = getRepository();
  const rawSalonSettings = await repo.getSalonSettings();
  const safeSettings = toAdminSettingsDTO(rawSalonSettings);
  const tz = safeSettings.timezone || 'America/Mexico_City';
  const monthKey = getWhatsAppMonthKey(new Date(), tz);

  const [templates, usage] = await Promise.all([
    repo.getWhatsAppTemplates(),
    repo.getWhatsAppMonthlyUsage(monthKey),
  ]);

  const readiness = getWhatsAppReadinessReport(env.appUrl);
  const includeLive = new URL(request.url).searchParams.get('live') === '1';
  const liveMeta = includeLive
    ? await fetchMetaWhatsAppStatus({ configuredTemplates: templates })
    : null;

  const payload: WhatsAppSettingsResponseDTO = {
    readiness,
    settings: {
      whatsappBookingEnabled: safeSettings.whatsappBookingEnabled,
      whatsappMonthlyQuota: safeSettings.whatsappMonthlyQuota ?? 500,
      smsRemindersEnabled: safeSettings.smsRemindersEnabled,
      whatsappNumber: safeSettings.whatsappNumber,
      salonName: safeSettings.name,
      timezone: tz,
    },
    templates,
    templateCatalog: WHATSAPP_TEMPLATE_CATALOG,
    usage,
    simulatorAllowed: isWhatsAppSimulatorAllowed(),
    mode: isSupabaseEnabled() ? 'supabase' : 'demo',
    ...(liveMeta ? { liveMeta } : {}),
  };

  return NextResponse.json(payload, { headers: PRIVATE_NO_STORE });
}

export async function POST(request: NextRequest) {
  const session = await requireAdmin(['owner', 'admin'], request);
  if (!session) {
    const authenticated = await getAdminSession(request);
    return NextResponse.json(
      {
        error: authenticated
          ? 'No tienes permisos para administrar WhatsApp Business.'
          : 'No autorizado',
      },
      { status: authenticated ? 403 : 401, headers: PRIVATE_NO_STORE },
    );
  }

  const rate = checkRateLimit({
    bucket: 'admin-whatsapp-settings',
    key: `${session.user.id}:${getRequestIp(request)}`,
    limit: 20,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Espera un momento antes de intentar de nuevo.' },
      {
        status: 429,
        headers: {
          ...PRIVATE_NO_STORE,
          'Retry-After': String(rate.retryAfterSeconds),
        },
      },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = (await request.json()) as unknown;
  } catch {
    return NextResponse.json(
      { error: 'Solicitud JSON inválida.' },
      { status: 400, headers: PRIVATE_NO_STORE },
    );
  }

  const parsedResult = WhatsAppSettingsActionSchema.safeParse(rawBody);
  if (!parsedResult.success) {
    return NextResponse.json(
      { error: parsedResult.error.issues[0]?.message || 'Datos inválidos.' },
      { status: 400, headers: PRIVATE_NO_STORE },
    );
  }

  const input = parsedResult.data;
  const repo = getRepository();

  try {
    if (input.action === 'update_settings') {
      if (session.user.role !== 'owner') {
        return NextResponse.json(
          { error: 'Solo la dueña puede modificar la configuración de WhatsApp.' },
          { status: 403, headers: PRIVATE_NO_STORE },
        );
      }
      const updatedRaw = await repo.updateSalonSettings(input.patch);
      const safeUpdated = toAdminSettingsDTO(updatedRaw);
      await repo.writeAuditLog({
        actorId: session.user.id,
        actorEmail: session.user.email,
        actorRole: session.user.role,
        action: 'workflow_updated',
        entityType: 'settings',
        entityId: 'whatsapp_settings',
        metadata: {
          whatsappBookingEnabled: safeUpdated.whatsappBookingEnabled,
          whatsappMonthlyQuota: safeUpdated.whatsappMonthlyQuota ?? 500,
          smsRemindersEnabled: safeUpdated.smsRemindersEnabled,
        },
      });
      return NextResponse.json(
        {
          ok: true,
          settings: {
            whatsappBookingEnabled: safeUpdated.whatsappBookingEnabled,
            whatsappMonthlyQuota: safeUpdated.whatsappMonthlyQuota ?? 500,
            smsRemindersEnabled: safeUpdated.smsRemindersEnabled,
            whatsappNumber: safeUpdated.whatsappNumber,
            salonName: safeUpdated.name,
            timezone: safeUpdated.timezone || 'America/Mexico_City',
          },
        },
        { headers: PRIVATE_NO_STORE },
      );
    }

    if (input.action === 'update_template') {
      if (session.user.role !== 'owner') {
        return NextResponse.json(
          { error: 'Solo la dueña puede editar plantillas oficiales de Meta.' },
          { status: 403, headers: PRIVATE_NO_STORE },
        );
      }
      const updated = await repo.updateWhatsAppTemplate(input.triggerKey, {
        ...(input.templateName !== undefined ? { templateName: input.templateName } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      });
      await repo.writeAuditLog({
        actorId: session.user.id,
        actorEmail: session.user.email,
        actorRole: session.user.role,
        action: 'workflow_updated',
        entityType: 'whatsapp_template',
        entityId: updated.triggerKey,
        metadata: {
          templateName: updated.templateName,
          isActive: updated.isActive,
        },
      });
      return NextResponse.json(
        { ok: true, template: updated },
        { headers: PRIVATE_NO_STORE },
      );
    }

    if (input.action === 'sync_meta_templates') {
      if (session.user.role !== 'owner') {
        return NextResponse.json(
          { error: 'Solo la dueña puede sincronizar plantillas con Meta.' },
          { status: 403, headers: PRIVATE_NO_STORE },
        );
      }
      const templates = await repo.getWhatsAppTemplates();
      const report = await syncOfficialTemplatesToMeta({
        configuredTemplates: templates,
      });
      return NextResponse.json(report, {
        status: report.ok ? 200 : 400,
        headers: PRIVATE_NO_STORE,
      });
    }

    const env = getRuntimeIntegrationStatus();
    const rawSettings = await repo.getSalonSettings();
    const safeSettings = toAdminSettingsDTO(rawSettings);
    const result = await sendWhatsAppLiveTestMessage({
      toPhone: input.toPhone,
      salonName: safeSettings.name,
      salonAddress: safeSettings.address,
      appUrl: env.appUrl,
      timezone: safeSettings.timezone || 'America/Mexico_City',
    });

    await repo.recordWhatsAppMessage({
      phoneE164: result.normalizedPhone,
      direction: 'outbound',
      senderKind: 'staff',
      senderName: `${session.user.fullName} (Prueba)`,
      messageType: 'template',
      bodyText: `Hola, esta es una prueba de conexión de WhatsApp Business para ${safeSettings.name} (${safeSettings.address}).`,
      templateTriggerKey: 'reminder_2h',
      deliveryStatus: result.status === 'sent' ? 'sent' : 'failed',
      deliveryMode: env.whatsappCloudConfigured ? 'template' : 'demo',
      providerMessageId: result.providerMessageId,
      errorMessage: result.errorMessage,
    });

    if (result.status !== 'sent') {
      return NextResponse.json(
        {
          ok: false,
          error: result.errorMessage || 'No se pudo enviar el mensaje de prueba.',
          deliveryMode: result.deliveryMode,
          fallbackWaMeUrl: result.fallbackWaMeUrl,
        },
        { status: 400, headers: PRIVATE_NO_STORE },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        normalizedPhone: result.normalizedPhone,
        deliveryMode: result.deliveryMode,
        providerMessageId: result.providerMessageId,
        fallbackWaMeUrl: result.fallbackWaMeUrl,
      },
      { headers: PRIVATE_NO_STORE },
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message || 'Datos inválidos.' },
        { status: 400, headers: PRIVATE_NO_STORE },
      );
    }
    return NextResponse.json(
      { error: 'No se pudo completar la operación de configuración de WhatsApp.' },
      { status: 500, headers: PRIVATE_NO_STORE },
    );
  }
}
