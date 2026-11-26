import openNextHandler from './.open-next/worker.js';

interface ScheduledController {
  readonly cron: string;
  readonly scheduledTime: number;
  noRetry(): void;
}

interface WorkerExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

interface WorkerEnv {
  CRON_SECRET?: string;
  NEXT_PUBLIC_APP_URL?: string;
  [key: string]: unknown;
}

interface OpenNextWorkerHandler {
  fetch(
    request: Request,
    env: WorkerEnv,
    ctx: WorkerExecutionContext,
  ): Promise<Response>;
}

const RETENTION_CRON = '0 9 * * *';
const FALLBACK_INTERNAL_ORIGIN = 'https://internal.laikona';

function resolveInternalOrigin(rawAppUrl: unknown): string {
  if (typeof rawAppUrl === 'string' && rawAppUrl.trim().length > 0) {
    try {
      const parsed = new URL(rawAppUrl.trim());
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        return parsed.origin;
      }
    } catch {
      return FALLBACK_INTERNAL_ORIGIN;
    }
  }
  return FALLBACK_INTERNAL_ORIGIN;
}

async function dispatchScheduledCron(
  controller: ScheduledController,
  env: WorkerEnv,
  ctx: WorkerExecutionContext,
): Promise<void> {
  const pathname =
    controller.cron === RETENTION_CRON
      ? '/api/cron/retention'
      : '/api/cron/reminders';

  const cronSecret =
    typeof env.CRON_SECRET === 'string' ? env.CRON_SECRET.trim() : '';

  if (!cronSecret) {
    console.error(
      `[laikona-worker] Skipping scheduled trigger (${controller.cron} -> ${pathname}): CRON_SECRET is not configured.`,
    );
    return;
  }

  const origin = resolveInternalOrigin(env.NEXT_PUBLIC_APP_URL);
  const request = new Request(`${origin}${pathname}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cronSecret}`,
      'User-Agent': 'laikona-cloudflare-cron/1.0',
    },
  });

  const handler: OpenNextWorkerHandler = openNextHandler;
  const response = await handler.fetch(request, env, ctx);
  const responseText = await response.text().catch(() => '');

  if (!response.ok) {
    console.error(
      `[laikona-worker] Scheduled trigger ${controller.cron} -> ${pathname} failed with HTTP ${response.status}: ${responseText.slice(0, 500)}`,
    );
    return;
  }

  console.info(
    `[laikona-worker] Scheduled trigger ${controller.cron} -> ${pathname} succeeded with HTTP ${response.status}.`,
  );
}

const worker = {
  async fetch(
    request: Request,
    env: WorkerEnv,
    ctx: WorkerExecutionContext,
  ): Promise<Response> {
    const handler: OpenNextWorkerHandler = openNextHandler;
    return handler.fetch(request, env, ctx);
  },

  async scheduled(
    controller: ScheduledController,
    env: WorkerEnv,
    ctx: WorkerExecutionContext,
  ): Promise<void> {
    const task = dispatchScheduledCron(controller, env, ctx);
    ctx.waitUntil(task);
    await task;
  },
};

export default worker;
