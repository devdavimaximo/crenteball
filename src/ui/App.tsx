import { GAME_NAME, GAME_VERSION } from '@/engine/meta';
import { t } from '@/ui/i18n';

export function App() {
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
    </main>
  );
}
