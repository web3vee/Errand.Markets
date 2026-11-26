import { deliverNotification } from '@/server/deliver-notification';
import { inngest } from '@/server/jobs';
import { fanOutPublished, sweep } from '@/server/workflows';

// Inngest v4: triggers are part of the function options.
export const deliverFn = inngest.createFunction(
  { id: 'notifications-deliver', retries: 4, triggers: [{ event: 'notifications/deliver' }] },
  async ({ event, step }) => step.run('deliver', () => deliverNotification(String((event.data as { deliveryId: string }).deliveryId))),
);

export const publishedFn = inngest.createFunction(
  { id: 'errands-published-fanout', retries: 3, triggers: [{ event: 'errands/published' }] },
  async ({ event, step }) => step.run('fan-out', () => fanOutPublished(String((event.data as { errandId: string }).errandId))),
);

export const sweepFn = inngest.createFunction(
  { id: 'errands-sweeper', triggers: [{ cron: '*/5 * * * *' }] },
  async ({ step }) => step.run('sweep', () => sweep()),
);

export const functions = [deliverFn, publishedFn, sweepFn];
