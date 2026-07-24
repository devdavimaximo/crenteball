import { useEffect, useState } from 'react';

import { GAME_NAME, GAME_VERSION } from '@/engine/meta';
import { ServiceWorkerPrompt } from '@/ui/components/ServiceWorkerPrompt';
import { t } from '@/ui/i18n';
import { MatchPrototype } from '@/ui/screens/MatchPrototype';
import { ShotPlayground } from '@/ui/screens/ShotPlayground';
import { TopDownPlay } from '@/ui/screens/TopDownPlay';
import { TopDownPreview } from '@/ui/screens/TopDownPreview';

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
  if (hash.startsWith('#jogar')) return <TopDownPlay />;
  if (hash.startsWith('#topdown')) return <TopDownPreview />;

  return (
    <main className="relative flex min-h-full flex-col items-center justify-center px-6 text-center text-white">
      {/* A floodlit glow behind the wordmark, from the same palette as the
          pitch — the menu should feel like the same stadium. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-1/2"
        style={{
          background:
            'radial-gradient(60% 55% at 50% 10%, rgba(125, 219, 164, 0.16), transparent 70%)',
        }}
      />

      <p className="eyebrow relative text-relva-300">{t('boot.milestone')}</p>
      <h1 className="relative mt-3 text-6xl font-black tracking-tighter">{GAME_NAME}</h1>
      <p className="relative mt-3 max-w-68 text-balance text-sm leading-relaxed text-white/55">
        {t('boot.tagline')}
      </p>

      <div className="relative mt-9 flex w-full max-w-xs flex-col gap-2.5">
        <a
          href="#partida"
          className="flex min-h-13 items-center justify-center rounded-full bg-relva-500 px-8 text-sm font-bold tracking-tight text-white transition-transform active:scale-95"
        >
          {t('boot.playMatch')}
        </a>
        <a
          href="#treino"
          className="flex min-h-13 items-center justify-center rounded-full bg-white/8 px-8 text-sm font-semibold text-white/85 ring-1 ring-white/10 transition-transform active:scale-95"
        >
          {t('boot.practice')}
        </a>
      </div>

      <code className="numeric relative mt-10 text-[0.7rem] tracking-wide text-white/25">
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
