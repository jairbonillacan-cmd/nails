import { NextRequest, NextResponse } from 'next/server';
import { constantTimeEqual } from '@/lib/auth/admin-session';
import {
  getConfiguredRetentionNoticeEmail,
  getRuntimeIntegrationStatus,
} from '@/lib/env';
import { dispatchRetentionWarningEmail } from '@/lib/integrations/notifications';
import { logError, logInfo, logWarn } from '@/lib/logger';
import {
  getRepository,
  listMediaAssetsForRetention,
  markMediaAssetPurged,
  markMediaRetentionWarned,
} from '@/lib/repositories/db';
import { deleteStoredMedia } from '@/lib/storage/media';
import { classifyMediaRetention } from '@/lib/storage/retention';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    logError('cron_retention_missing_secret');
    return NextResponse.json(
      { error: 'CRON_SECRET no configurado' },
      { status: 503 },
    );
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logWarn('cron_retention_unauthorized', { reason: 'missing_bearer' });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const provided = authHeader.slice('Bearer '.length);
  if (!provided || !constantTimeEqual(provided, secret)) {
    logWarn('cron_retention_unauthorized', { reason: 'invalid_token' });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const env = getRuntimeIntegrationStatus();
    const settings = await getRepository().getSalonSettings();

    const recipientEmail =
      settings.retentionNoticeEmail?.trim() ||
      getConfiguredRetentionNoticeEmail() ||
      settings.contactEmail?.trim() ||
      '';

    const assets = await listMediaAssetsForRetention();
    const { warn30d, warn7d, purgeDue } = classifyMediaRetention(assets, nowMs);

    let warned30dCount = 0;
    let warned7dCount = 0;
    let warningsFailedCount = 0;
    let purgedCount = 0;
    let purgeFailedCount = 0;

    if (warn30d.length > 0) {
      if (!recipientEmail) {
        logWarn('cron_retention_missing_recipient', { stage: '30d', count: warn30d.length });
        warningsFailedCount += warn30d.length;
      } else {
        const dispatchRes = await dispatchRetentionWarningEmail({
          to: recipientEmail,
          stage: '30d',
          assets: warn30d,
          settings,
          appUrl: env.appUrl,
        });
        if (dispatchRes.status === 'sent') {
          for (const asset of warn30d) {
            await markMediaRetentionWarned(asset.id, '30d', nowIso);
            warned30dCount += 1;
          }
        } else {
          logWarn('cron_retention_warning_failed', {
            stage: '30d',
            count: warn30d.length,
            error: dispatchRes.errorMessage,
          });
          warningsFailedCount += warn30d.length;
        }
      }
    }

    if (warn7d.length > 0) {
      if (!recipientEmail) {
        logWarn('cron_retention_missing_recipient', { stage: '7d', count: warn7d.length });
        warningsFailedCount += warn7d.length;
      } else {
        const dispatchRes = await dispatchRetentionWarningEmail({
          to: recipientEmail,
          stage: '7d',
          assets: warn7d,
          settings,
          appUrl: env.appUrl,
        });
        if (dispatchRes.status === 'sent') {
          for (const asset of warn7d) {
            await markMediaRetentionWarned(asset.id, '7d', nowIso);
            warned7dCount += 1;
          }
        } else {
          logWarn('cron_retention_warning_failed', {
            stage: '7d',
            count: warn7d.length,
            error: dispatchRes.errorMessage,
          });
          warningsFailedCount += warn7d.length;
        }
      }
    }

    for (const asset of purgeDue) {
      try {
        await deleteStoredMedia(asset.storagePath);
        await markMediaAssetPurged(asset.id, nowIso);
        purgedCount += 1;
      } catch (err) {
        logError('cron_retention_purge_item_failed', {
          assetId: asset.id,
          storagePath: asset.storagePath,
          error: err,
        });
        purgeFailedCount += 1;
      }
    }

    const summary = {
      evaluatedCount: assets.length,
      warn30dDueCount: warn30d.length,
      warn7dDueCount: warn7d.length,
      purgeDueCount: purgeDue.length,
      warned30dCount,
      warned7dCount,
      warningsFailedCount,
      purgedCount,
      purgeFailedCount,
      recipientEmail: recipientEmail || null,
      executedAt: nowIso,
    };

    if (warningsFailedCount > 0 || purgeFailedCount > 0) {
      logWarn('cron_retention_partial_failure', summary);
    } else {
      logInfo('cron_retention_completed', summary);
    }

    return NextResponse.json(summary);
  } catch (err) {
    logError('cron_retention_exception', { error: err });
    return NextResponse.json(
      { error: 'Error procesando retención de archivos' },
      { status: 500 },
    );
  }
}
