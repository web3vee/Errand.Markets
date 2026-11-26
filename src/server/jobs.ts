import 'server-only';
import { Inngest } from 'inngest';
import { after } from 'next/server';

/**
 * Background work. With INNGEST_EVENT_KEY set, events go to Inngest (retries, cron, observability).
 * Without it (local / sandbox), the same handler runs right after the response via next/server `after`.
 */
export const inngest = new Inngest({ id: 'errand-markets' });

export type JobEvents = {
  'notifications/deliver': { deliveryId: string };
  'errands/published': { errandId: string };
};

type Handler<K extends keyof JobEvents> = (data: JobEvents[K]) => Promise<unknown>;
const inline: { [K in keyof JobEvents]?: Handler<K> } = {};
export function registerInline<K extends keyof JobEvents>(name: K, h: Handler<K>) {
  (inline as Record<string, unknown>)[name] = h;
}

export async function enqueue<K extends keyof JobEvents>(name: K, data: JobEvents[K]) {
  if (process.env.INNGEST_EVENT_KEY) {
    await inngest.send({ name, data });
    return;
  }
  const h = inline[name] as Handler<K> | undefined;
  if (!h) throw new Error(`no inline handler for ${name}`);
  const run = () => h(data).catch((e) => console.error(JSON.stringify({ level: 'error', msg: 'inline job failed', job: name, error: String(e) })));
  try {
    after(run);
  } catch {
    await run(); // outside a request (scripts/tests)
  }
}
