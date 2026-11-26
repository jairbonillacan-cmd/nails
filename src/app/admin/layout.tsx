import type { Metadata } from 'next';
import React, { Suspense } from 'react';
import './admin.css';
import { getAdminSession } from '@/lib/auth/admin-session';
import { buildAdminOverviewPayload } from '@/lib/admin/overview-loader';
import { AdminProvider } from '@/components/admin/AdminProvider';
import { AdminShell } from '@/components/admin/AdminShell';
import { AdminShellSkeleton } from '@/components/ui/SkeletonBlock';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: {
    default: 'Panel',
    template: '%s · Panel LAIKONA NAILS',
  },
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAdminSession();
  const initialData = session ? await buildAdminOverviewPayload(session) : null;

  return (
    <Suspense fallback={<AdminShellSkeleton ariaLabel="Abriendo tu panel de LAIKONA NAILS" />}>
      <AdminProvider initialData={initialData}>
        <AdminShell>{children}</AdminShell>
      </AdminProvider>
    </Suspense>
  );
}
