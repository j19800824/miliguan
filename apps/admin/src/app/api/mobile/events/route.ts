import { getMobileSession } from '@/lib/auth/mobile';
import { subscribeEvents, type ScopedEvent } from '@/lib/event-bus';

// SSE streams must not be statically optimised.
export const dynamic = 'force-dynamic';

const KEEPALIVE_MS = 25_000;

export async function GET(req: Request) {
  const user = await getMobileSession(req);
  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const encoder = new TextEncoder();
  const userId = user.id;
  const filter = {
    userId,
    companyId: user.companyId,
    storeId: user.storeId,
    role: user.roleName,
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      let unsubscribe: null | (() => Promise<void>) = null;
      let interval: ReturnType<typeof setInterval> | null = null;

      const close = async () => {
        if (closed) return;
        closed = true;
        if (interval) clearInterval(interval);
        if (unsubscribe) await unsubscribe();
        try {
          controller.close();
        } catch {
          /* ignore */
        }
      };

      try {
        unsubscribe = await subscribeEvents(filter, (event: ScopedEvent) => {
          send(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
        });
      } catch {
        send(`event: error\ndata: ${JSON.stringify({ message: 'bus unavailable' })}\n\n`);
        await close();
        return;
      }

      // Hello + initial keepalive so the client knows it's connected.
      send(`event: hello\ndata: ${JSON.stringify({ userId, ts: Date.now() })}\n\n`);
      interval = setInterval(() => send(`:keepalive\n\n`), KEEPALIVE_MS);

      // Detect client disconnect (RN closes the connection).
      const signal = req.signal;
      if (signal.aborted) {
        await close();
      } else {
        signal.addEventListener('abort', () => {
          void close();
        });
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
