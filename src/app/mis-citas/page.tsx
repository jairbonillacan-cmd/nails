import type { Metadata } from 'next';
import { readClientPortalSession } from '@/lib/auth/client-portal-otp';
import {
  ClientPortalSnapshotDTOSchema,
  toPublicSettingsDTO,
  type ClientPortalSnapshotDTO,
} from '@/lib/public-dto';
import {
  getClientPortalSnapshotByPhone,
  getSnapshot,
} from '@/lib/repositories/db';
import { isSupabaseEnabled } from '@/lib/repositories/supabase-client';
import { ClientPortalView } from '@/components/portal/ClientPortalView';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { settings } = getSnapshot();
  return {
    title: 'Mis citas',
    description: `Consulta tus próximas citas, historial, sellos de fidelidad y paquetes en ${settings.name}.`,
    robots: { index: false, follow: false },
  };
}

export default async function MisCitasPage() {
  const db = getSnapshot();
  const settings = toPublicSettingsDTO(db.settings);
  const session = await readClientPortalSession();

  let initialSnapshot: ClientPortalSnapshotDTO | null = null;
  if (session) {
    initialSnapshot = ClientPortalSnapshotDTOSchema.parse(
      getClientPortalSnapshotByPhone(session.phoneE164),
    );
  }

  const showDemoHint =
    !isSupabaseEnabled() && process.env.NODE_ENV !== 'production';

  return (
    <ClientPortalView
      settings={settings}
      initialSnapshot={initialSnapshot}
      showDemoHint={showDemoHint}
    />
  );
}
