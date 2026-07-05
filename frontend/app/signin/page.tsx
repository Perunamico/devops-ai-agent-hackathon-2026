'use client';

import EmailAuthScreen from '../../src/screens/auth/EmailAuthScreen';
import { PublicOnly } from '../../src/screens/auth/shared';

export default function Page() {
  return (
    <PublicOnly>
      <EmailAuthScreen mode="signin" />
    </PublicOnly>
  );
}
