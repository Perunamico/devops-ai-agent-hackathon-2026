'use client';

import ResetScreen from '../../src/screens/auth/ResetScreen';
import { PublicOnly } from '../../src/screens/auth/shared';

export default function Page() {
  return (
    <PublicOnly>
      <ResetScreen />
    </PublicOnly>
  );
}
