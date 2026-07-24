import { useEffect, useState } from 'react';

import { GAME_NAME, GAME_VERSION } from '@/engine/meta';
import { ServiceWorkerPrompt } from '@/ui/components/ServiceWorkerPrompt';
import { t } from '@/ui/i18n';
import { CareerHome } from '@/ui/screens/CareerHome';
import { CreateAthlete } from '@/ui/screens/CreateAthlete';
import { TopDownMatch } from '@/ui/screens/TopDownMatch';
import { TopDownPlay } from '@/ui/screens/TopDownPlay';
import { TopDownPreview } from '@/ui/screens/TopDownPreview';
import { useCareerStore } from '@/ui/stores/careerStore';

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

/** The wordmark, floodlit. Shown while the save is being read, and on failure. */
function Splash({ children }: { children: React.ReactNode }) {
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

      <div className="relative mt-6 flex w-full max-w-xs flex-col items-center gap-4">{children}</div>

      <code className="numeric relative mt-10 text-[0.7rem] tracking-wide text-white/25">
        v{GAME_VERSION}
      </code>
    </main>
  );
}

/**
 * The career, or the way into one.
 *
 * Everything hangs off the save: with none, the only thing to do is create an
 * athlete; with one, the career opens straight away. A save that exists but
 * cannot be read is the one case that must never silently become "start over"
 * — that would delete a career to fix a bug.
 */
function CareerScreen() {
  const status = useCareerStore((store) => store.status);
  const state = useCareerStore((store) => store.state);
  const discard = useCareerStore((store) => store.discard);

  if (status === 'loading') {
    return (
      <Splash>
        <p className="text-sm text-white/45">{t('career.loading')}</p>
      </Splash>
    );
  }

  if (status === 'error') {
    return (
      <Splash>
        <p className="text-sm font-semibold text-white/80">{t('career.loadFailed')}</p>
        <p className="text-xs leading-relaxed text-balance text-white/40">
          {t('career.loadFailedHint')}
        </p>
        <button
          type="button"
          onClick={() => void discard()}
          className="min-h-12 rounded-full bg-white/8 px-7 text-sm font-semibold text-white/85 ring-1 ring-white/10 transition-transform active:scale-95"
        >
          {t('career.startOver')}
        </button>
      </Splash>
    );
  }

  if (status === 'empty' || !state) return <CreateAthlete />;

  return <CareerHome state={state} />;
}

function Screen({ hash }: { hash: string }) {
  if (hash === '#partida' || hash === '#match') return <TopDownMatch />;
  if (hash.startsWith('#treino') || hash.startsWith('#jogar')) return <TopDownPlay />;
  if (hash.startsWith('#topdown')) return <TopDownPreview />;

  return <CareerScreen />;
}

export function App() {
  const hash = useHash();
  const load = useCareerStore((store) => store.load);

  // One read, at boot. Every later change goes through the store, which writes
  // as it goes — nothing else needs to touch IndexedDB.
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="h-full bg-noite-900">
      <Screen hash={hash} />
      {/* Always mounted: an update prompt that only appears on the splash
          would never be seen by someone who opens straight into a match. */}
      <ServiceWorkerPrompt />
    </div>
  );
}
