import { NextResponse } from 'next/server';
import { getRepository } from '@/lib/repositories/db';
import { getRuntimeIntegrationStatus } from '@/lib/env';

export const dynamic = 'force-dynamic';

export async function GET() {
  const bootstrap = await getRepository().getPublicBootstrap();
  const integration = getRuntimeIntegrationStatus();

  return NextResponse.json({
    ...bootstrap,
    integrationMode: integration.mode,
  });
}
