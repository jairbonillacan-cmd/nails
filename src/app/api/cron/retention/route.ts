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
  pruneOldFunnelEvents,
} from '@/lib/repositories/db';
import { deleteStoredMedia } from '@/lib/storage/media';
import { classifyMediaRetention } from '@/lib/storage/retention';

export const dynamic = 'force-dynamic';

const MAX_RETENTION_ASSETS_PER_RUN = 10;
const FUNNEL_EVENTS_RETENTION_DAYS = 90;

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store',
} as const;

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    logError('cron_retention_missing_secret');
    return NextResponse.json(
      { error: 'CRON_SECRET no configurado' },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logWarn('cron_retention_unauthorized', { reason: 'missing_bearer' });
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }
  const provided = authHeader.slice('Bearer '.length);
  if (!provided || !constantTimeEqual(provided, secret)) {
    logWarn('cron_retention_unauthorized', { reason: 'invalid_token' });
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  try {
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const funnelCutoffIso = new Date(
      nowMs - FUNNEL_EVENTS_RETENTION_DAYS * 86_400_000,
    ).toISOString();
    const env = getRuntimeIntegrationStatus();
    const [settings, assets, prunedFunnelEventsCount] = await Promise.all([
      getRepository().getSalonSettings(),
      listMediaAssetsForRetention(),
      pruneOldFunnelEvents(funnelCutoffIso),
    ]);

    const recipientEmail =
      settings.retentionNoticeEmail?.trim() ||
      getConfiguredRetentionNoticeEmail() ||
      settings.contactEmail?.trim() ||
      '';

    const { warn30d, warn7d, purgeDue } = classifyMediaRetention(assets, nowMs);

    let remainingBudget = MAX_RETENTION_ASSETS_PER_RUN;
    const warn30dBatch = warn30d.slice(0, remainingBudget);
    remainingBudget = Math.max(0, remainingBudget - warn30dBatch.length);
    const warn7dBatch = warn7d.slice(0, remainingBudget);
    remainingBudget = Math.max(0, remainingBudget - warn7dBatch.length);
    const purgeDueBatch = purgeDue.slice(0, remainingBudget);
    const deferredCount =
      warn30d.length -
      warn30dBatch.length +
      (warn7d.length - warn7dBatch.length) +
      (purgeDue.length - purgeDueBatch.length);

    let warned30dCount = 0;
    let warned7dCount = 0;
    let warningsFailedCount = 0;
    let purgedCount = 0;
    let purgeFailedCount = 0;

    if (warn30dBatch.length > 0) {
      if (!recipientEmail) {
        logWarn('cron_retention_missing_recipient', {
          stage: '30d',
          count: warn30dBatch.length,
        });
        warningsFailedCount += warn30dBatch.length;
      } else {
        const dispatchRes = await dispatchRetentionWarningEmail({
          to: recipientEmail,
          stage: '30d',
          assets: warn30dBatch,
          settings,
          appUrl: env.appUrl,
        });
        if (dispatchRes.status === 'sent') {
          for (const asset of warn30dBatch) {
            await markMediaRetentionWarned(asset.id, '30d', nowIso);
            warned30dCount += 1;
          }
        } else {
          logWarn('cron_retention_warning_failed', {
            stage: '30d',
            count: warn30dBatch.length,
            error: dispatchRes.errorMessage,
          });
          warningsFailedCount += warn30dBatch.length;
        }
      }
    }

    if (warn7dBatch.length > 0) {
      if (!recipientEmail) {
        logWarn('cron_retention_missing_recipient', {
          stage: '7d',
          count: warn7dBatch.length,
        });
        warningsFailedCount += warn7dBatch.length;
      } else {
        const dispatchRes = await dispatchRetentionWarningEmail({
          to: recipientEmail,
          stage: '7d',
          assets: warn7dBatch,
          settings,
          appUrl: env.appUrl,
        });
        if (dispatchRes.status === 'sent') {
          for (const asset of warn7dBatch) {
            await markMediaRetentionWarned(asset.id, '7d', nowIso);
            warned7dCount += 1;
          }
        } else {
          logWarn('cron_retention_warning_failed', {
            stage: '7d',
            count: warn7dBatch.length,
            error: dispatchRes.errorMessage,
          });
          warningsFailedCount += warn7dBatch.length;
        }
      }
    }

    for (const asset of purgeDueBatch) {
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
      deferredCount,
      prunedFunnelEventsCount,
      recipientEmail: recipientEmail || null,
      executedAt: nowIso,
    };

    if (warningsFailedCount > 0 || purgeFailedCount > 0) {
      logWarn('cron_retention_partial_failure', summary);
    } else {
      logInfo('cron_retention_completed', summary);
    }

    return NextResponse.json(summary, { headers: NO_STORE_HEADERS });
  } catch (err) {
    logError('cron_retention_exception', { error: err });
    return NextResponse.json(
      { error: 'Error procesando retención de archivos' },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
