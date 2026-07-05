'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '../../src/AppContext';
import LabelSelectScreen from '../../src/screens/LabelSelectScreen';
import { AuthLoadingScreen } from '../../src/screens/auth/shared';

// 名付け前のオンボーディング: 好きなものラベルの選択。pet 未作成かつ未選択のとき (app) の
// ガードからここへ誘導される。ラベルの登録自体は命名完了(createPet)後に HomeScreen が行う。
export default function Page() {
  const { auth, authLoading, pet, petResolved, labelsChosen, selectedLabels, setSelectedLabels, setLabelsChosen } = useApp();
  const router = useRouter();

  const waiting = authLoading || !auth || (auth.configured && auth.signedIn && auth.emailVerified && !petResolved);
  const destination = waiting
    ? null
    : !auth!.configured
      ? '/home'
      : !auth!.signedIn
        ? '/'
        : !auth!.emailVerified
          ? '/verify-email'
          : (pet !== null || labelsChosen)
            ? '/home'
            : null;

  useEffect(() => {
    if (destination) router.replace(destination);
  }, [destination, router]);

  if (waiting || destination) return <AuthLoadingScreen />;

  return (
    <div className="app-shell">
      <LabelSelectScreen
        initial={selectedLabels}
        mode="onboarding"
        onDone={(labels) => {
          setSelectedLabels(labels);
          setLabelsChosen(true);
          router.replace('/home');
        }}
      />
    </div>
  );
}
