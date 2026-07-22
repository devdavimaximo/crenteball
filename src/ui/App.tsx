import { useEffect, useState } from 'react';

import { GAME_NAME, GAME_VERSION } from '@/engine/meta';
import { ServiceWorkerPrompt } from '@/ui/components/ServiceWorkerPrompt';
import { t } from '@/ui/i18n';
import { MatchPrototype } from '@/ui/screens/MatchPrototype';
import { ShotPlayground } from '@/ui/screens/ShotPlayground';

/**
 * Hash-based switching, deliberately primitive. A router earns its place when
 * the game has a career to navigate (M4 onwards) — not before.
 *
 * The installed app launches at `/`, so this splash is the only way in: every
 * playable screen needs a button here or it may as well not exist.
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

function Screen({ hash }: { hash: string }) {
  if (hash === '#partida' || hash === '#match') return <MatchPrototype />;
  if (hash === '#treino' || hash === '#shot' || hash === '#render') return <ShotPlayground />;

  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-3 px-6 text-center text-white">
      <p className="text-xs font-medium uppercase tracking-[0.3em] text-relva-300">
        {t('boot.milestone')}
      </p>
      <h1 className="text-5xl font-black tracking-tight">{GAME_NAME}</h1>
      <p className="max-w-xs text-balance text-sm text-white/60">{t('boot.tagline')}</p>

      <div className="mt-6 flex w-full max-w-xs flex-col gap-3">
        <a
          href="#partida"
          className="flex min-h-12 items-center justify-center rounded-full bg-relva-500 px-8 text-sm font-bold text-white"
        >
          {t('boot.playMatch')}
        </a>
        <a
          href="#treino"
          className="flex min-h-12 items-center justify-center rounded-full bg-white/10 px-8 text-sm font-semibold text-white"
        >
          {t('boot.practice')}
        </a>
      </div>

      <code className="mt-6 rounded-full bg-white/5 px-3 py-1 text-xs text-white/40">
        v{GAME_VERSION}
      </code>
    </main>
  );
}

export function App() {
  const hash = useHash();

  return (
    <div className="h-full bg-noite-900">
      <Screen hash={hash} />
      {/* Always mounted: an update prompt that only appears on the splash
          would never be seen by someone who opens straight into a match. */}
      <ServiceWorkerPrompt />
    </div>
  );
}
