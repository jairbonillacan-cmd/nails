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

const CRON_ROUTE_BY_EXPRESSION: Readonly<Record<string, string>> = {
  '*/15 * * * *': '/api/cron/reminders',
  '0 9 * * *': '/api/cron/retention',
};
const CRON_TIMEOUT_MS = 25_000;
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

function resolveCronPath(expression: string): string {
  const pathname = CRON_ROUTE_BY_EXPRESSION[expression];
  if (!pathname) {
    throw new Error(`[laikona-worker] Unrecognized scheduled cron expression: ${expression}`);
  }
  return pathname;
}

async function fetchWithTimeout(
  handler: OpenNextWorkerHandler,
  request: Request,
  env: WorkerEnv,
  ctx: WorkerExecutionContext,
  timeoutMs: number,
): Promise<Response> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`[laikona-worker] Scheduled cron timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([handler.fetch(request, env, ctx), timeoutPromise]);
  } finally {
    if (timer !== null) {
      clearTimeout(timer);
    }
  }
}

async function dispatchScheduledCron(
  controller: ScheduledController,
  env: WorkerEnv,
  ctx: WorkerExecutionContext,
): Promise<void> {
  const pathname = resolveCronPath(controller.cron);

  const cronSecret =
    typeof env.CRON_SECRET === 'string' ? env.CRON_SECRET.trim() : '';

  if (!cronSecret) {
    const message = `[laikona-worker] Scheduled trigger (${controller.cron} -> ${pathname}) aborted: CRON_SECRET is not configured.`;
    console.error(message);
    throw new Error(message);
  }

  const origin = resolveInternalOrigin(env.NEXT_PUBLIC_APP_URL);
  const request = new Request(`${origin}${pathname}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cronSecret}`,
      'User-Agent': 'laikona-cloudflare-cron/1.0',
    },
    signal: AbortSignal.timeout(CRON_TIMEOUT_MS),
  });

  const handler: OpenNextWorkerHandler = openNextHandler;
  const response = await fetchWithTimeout(handler, request, env, ctx, CRON_TIMEOUT_MS);
  const responseText = await response.text().catch(() => '');

  if (!response.ok) {
    const message = `[laikona-worker] Scheduled trigger ${controller.cron} -> ${pathname} failed with HTTP ${response.status}: ${responseText.slice(0, 500)}`;
    console.error(message);
    throw new Error(message);
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
    await dispatchScheduledCron(controller, env, ctx);
  },
};

export default worker;
