import { useEffect, useState } from 'react';

import { GAME_NAME, GAME_VERSION } from '@/engine/meta';
import { ServiceWorkerPrompt } from '@/ui/components/ServiceWorkerPrompt';
import { t } from '@/ui/i18n';
import { MatchPrototype } from '@/ui/screens/MatchPrototype';
import { ShotPlayground } from '@/ui/screens/ShotPlayground';

/**
 * Hash-based switching, deliberately primitive: `#shot` (or the older
 * `#render`) opens the playable shot harness, anything else the splash. A
 * router earns its place when the game has real screens (M3.7) — not before.
 */
function useHash(): string {
  const [hash, setHash] = useState(window.location.hash);

  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return hash;
}

export function App() {
  const hash = useHash();

  if (hash === '#partida' || hash === '#match') {
    return (
      <div className="h-full bg-noite-900">
        <MatchPrototype />
      </div>
    );
  }

  if (hash === '#shot' || hash === '#render') {
    return (
      <div className="h-full bg-noite-900">
        <ShotPlayground />
      </div>
    );
  }

  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-3 bg-noite-900 px-6 text-center text-white">
      <p className="text-xs font-medium uppercase tracking-[0.3em] text-relva-300">
        {t('boot.milestone')}
      </p>
      <h1 className="text-5xl font-black tracking-tight">{GAME_NAME}</h1>
      <p className="max-w-xs text-balance text-sm text-white/60">{t('boot.tagline')}</p>
      <code className="mt-4 rounded-full bg-white/5 px-3 py-1 text-xs text-white/40">
        v{GAME_VERSION}
      </code>

      <ServiceWorkerPrompt />
    </main>
  );
}
