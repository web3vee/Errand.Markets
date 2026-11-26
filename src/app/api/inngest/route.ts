import { serve } from 'inngest/next';
import { functions } from '@/jobs/functions';
import { inngest } from '@/server/jobs';

export const runtime = 'nodejs';
export const { GET, POST, PUT } = serve({ client: inngest, functions });
