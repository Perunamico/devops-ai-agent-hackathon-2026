'use client';

import type { ReactNode } from 'react';
import AppGuard from '../../src/components/AppGuard';
import AppShell from '../../src/components/AppShell';

export default function AppGroupLayout({ children }: { children: ReactNode }) {
  return (
    <AppGuard>
      <AppShell>{children}</AppShell>
    </AppGuard>
  );
}
