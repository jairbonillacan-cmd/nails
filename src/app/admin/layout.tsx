import type { Metadata } from 'next';
import React, { Suspense } from 'react';
import { Inter, Plus_Jakarta_Sans } from 'next/font/google';
import { VStack } from '@astryxdesign/core/VStack';
import '@/astryx-themes';
import './admin.css';
import { getAdminSession } from '@/lib/auth/admin-session';
import { buildAdminOverviewPayload } from '@/lib/admin/overview-loader';
import { AdminProvider } from '@/components/admin/AdminProvider';
import { AdminShell } from '@/components/admin/AdminShell';
import { AdminShellSkeleton } from '@/components/ui/SkeletonBlock';

export const dynamic = 'force-dynamic';

const adminSans = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-admin-sans',
  display: 'swap',
  adjustFontFallback: true,
});

const adminDisplay = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-admin-display',
  display: 'swap',
  adjustFontFallback: true,
});

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
    <VStack
      gap={0}
      width="100%"
      className={`${adminSans.variable} ${adminDisplay.variable}`}
    >
      <Suspense fallback={<AdminShellSkeleton ariaLabel="Abriendo tu panel de LAIKONA NAILS" />}>
        <AdminProvider initialData={initialData}>
          <AdminShell>{children}</AdminShell>
        </AdminProvider>
      </Suspense>
    </VStack>
  );
}
