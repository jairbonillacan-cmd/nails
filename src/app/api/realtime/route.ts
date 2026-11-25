import {
  subscribeRealtime,
  toPublicRealtimeEvent,
  type PublicRealtimeEvent,
} from '@/lib/realtime';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: PublicRealtimeEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          return;
        }
      };

      send(toPublicRealtimeEvent('connected'));
      unsubscribe = subscribeRealtime((event) => {
        send(
          toPublicRealtimeEvent(
            event.type,
            {
              staffId: event.staffId,
              date: event.date,
            },
            event.timestamp,
          ),
        );
      });
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          if (heartbeat) clearInterval(heartbeat);
        }
      }, 20_000);
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      if (unsubscribe) unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
