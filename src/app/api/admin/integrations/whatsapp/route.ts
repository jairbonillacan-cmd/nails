import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminSession, requireAdmin } from '@/lib/auth/admin-session';
import { AdminWhatsAppActionSchema } from '@/lib/contracts';
import { getRuntimeIntegrationStatus } from '@/lib/env';
import {
  ADMIN_PRIVATE_HEADERS,
  withAdminPrivateHeaders,
} from '@/lib/http/admin-headers';
import {
  fetchMetaWhatsAppStatus,
  getWhatsAppReadinessReport,
  sendWhatsAppLiveTestMessage,
  syncOfficialTemplatesToMeta,
} from '@/lib/integrations/whatsapp-cloud';
import { getWhatsAppMonthKey } from '@/lib/integrations/whatsapp-templates';
import { logError } from '@/lib/logger';
import {
  getRepository,
  getWhatsAppMonthlyUsage,
  getWhatsAppTemplates,
  updateWhatsAppTemplate,
} from '@/lib/repositories/db';
import { checkRateLimit, getRequestIp } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await requireAdmin(['owner'], request);
  if (!session) {
    const authenticated = await getAdminSession(request);
    return NextResponse.json(
      {
        error: authenticated
          ? 'Solo la dueña puede administrar WhatsApp Business.'
          : 'No autorizado',
      },
      { status: authenticated ? 403 : 401, headers: ADMIN_PRIVATE_HEADERS },
    );
  }

  const env = getRuntimeIntegrationStatus();
  const settings = await getRepository().getSalonSettings();
  const tz = settings.timezone || 'America/Mexico_City';
  const monthKey = getWhatsAppMonthKey(new Date(), tz);
  const [templates, usage] = await Promise.all([
    getWhatsAppTemplates(),
    getWhatsAppMonthlyUsage(monthKey),
  ]);
  const readiness = getWhatsAppReadinessReport(env.appUrl);
  const includeLive = new URL(request.url).searchParams.get('live') === '1';

  const liveMeta = includeLive
    ? await fetchMetaWhatsAppStatus({ configuredTemplates: templates })
    : null;

  return NextResponse.json(
    {
      readiness,
      templates,
      usage,
      ...(liveMeta ? { liveMeta } : {}),
    },
    { headers: ADMIN_PRIVATE_HEADERS },
  );
}

export async function POST(request: NextRequest) {
  const session = await requireAdmin(['owner'], request);
  if (!session) {
    const authenticated = await getAdminSession(request);
    return NextResponse.json(
      {
        error: authenticated
          ? 'Solo la dueña puede administrar WhatsApp Business.'
          : 'No autorizado',
      },
      { status: authenticated ? 403 : 401, headers: ADMIN_PRIVATE_HEADERS },
    );
  }

  const rate = checkRateLimit({
    bucket: 'admin-whatsapp-manage',
    key: `${session.user.id}:${getRequestIp(request)}`,
    limit: 20,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Espera un momento antes de intentar de nuevo.' },
      {
        status: 429,
        headers: withAdminPrivateHeaders({
          'Retry-After': String(rate.retryAfterSeconds),
        }),
      },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = (await request.json()) as unknown;
  } catch {
    return NextResponse.json(
      { error: 'Solicitud JSON inválida.' },
      { status: 400, headers: ADMIN_PRIVATE_HEADERS },
    );
  }

  try {
    const parsed = AdminWhatsAppActionSchema.parse(rawBody);

    if (parsed.action === 'update_template') {
      const updated = await updateWhatsAppTemplate(parsed.triggerKey, {
        ...(parsed.templateName !== undefined ? { templateName: parsed.templateName } : {}),
        ...(parsed.isActive !== undefined ? { isActive: parsed.isActive } : {}),
      });
      return NextResponse.json(
        { ok: true, template: updated },
        { headers: ADMIN_PRIVATE_HEADERS },
      );
    }

    if (parsed.action === 'sync_meta_templates') {
      const templates = await getWhatsAppTemplates();
      const report = await syncOfficialTemplatesToMeta({
        configuredTemplates: templates,
      });
      return NextResponse.json(report, {
        status: report.ok ? 200 : 400,
        headers: ADMIN_PRIVATE_HEADERS,
      });
    }

    const env = getRuntimeIntegrationStatus();
    const settings = await getRepository().getSalonSettings();
    const result = await sendWhatsAppLiveTestMessage({
      toPhone: parsed.toPhone,
      salonName: settings.name,
      salonAddress: settings.address,
      appUrl: env.appUrl,
      timezone: settings.timezone || 'America/Mexico_City',
    });

    if (result.status !== 'sent') {
      return NextResponse.json(
        {
          ok: false,
          error: result.errorMessage || 'No se pudo enviar el mensaje de prueba.',
          deliveryMode: result.deliveryMode,
          fallbackWaMeUrl: result.fallbackWaMeUrl,
        },
        { status: 400, headers: ADMIN_PRIVATE_HEADERS },
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
      { headers: ADMIN_PRIVATE_HEADERS },
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message || 'Datos inválidos.' },
        { status: 400, headers: ADMIN_PRIVATE_HEADERS },
      );
    }
    logError('admin_integrations_whatsapp_post_error', {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'No se pudo completar la operación de WhatsApp.' },
      { status: 500, headers: ADMIN_PRIVATE_HEADERS },
    );
  }
}
