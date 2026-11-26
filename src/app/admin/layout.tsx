import type { Metadata } from 'next';
import React, { Suspense } from 'react';
import './admin.css';
import { AdminProvider } from '@/components/admin/AdminProvider';
import { AdminShell } from '@/components/admin/AdminShell';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: {
    default: 'Panel',
    template: '%s · Panel LAIKONA NAILS',
  },
  robots: { index: false, follow: false },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={null}>
      <AdminProvider>
        <AdminShell>{children}</AdminShell>
      </AdminProvider>
    </Suspense>
  );
}
