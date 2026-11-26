import React, { Suspense } from 'react';
import { AdminProvider } from '@/components/admin/AdminProvider';
import { AdminShell } from '@/components/admin/AdminShell';

export const dynamic = 'force-dynamic';

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
