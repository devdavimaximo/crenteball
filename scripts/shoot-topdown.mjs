/**
 * Screenshots the top-down renderer, headlessly.
 *
 * WebGL cannot be rendered by the Node canvas the way the old perspective
 * previews were, so this drives the real thing in a real browser: it starts
 * Vite, opens each preview scene in headless Chrome, and saves a PNG. Same
 * principle as `npm run preview` — never judge the rendering blind — just
 * through a browser, because that is where PixiJS actually runs.
 *
 *   npm run preview:topdown
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '.preview');
const PORT = 5219;
const SCENES = ['shot', 'through-ball', 'cross', 'dribble'];

function waitForServer(url, timeoutMs = 30000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const res = await fetch(url);
        if (res.ok) return resolve();
      } catch {
        // not up yet
      }
      if (Date.now() - started > timeoutMs) return reject(new Error('vite nao subiu'));
      setTimeout(() => void tick(), 300);
    };
    void tick();
  });
}

async function main() {
  mkdirSync(OUT, { recursive: true });

  // Spawn Vite directly through node — no npm shim, no shell — so the child
  // is a single process this script can reliably kill on any platform.
  const vite = spawn(
    process.execPath,
    ['node_modules/vite/bin/vite.js', '--port', String(PORT), '--strictPort'],
    { cwd: ROOT, stdio: 'ignore' },
  );

  try {
    console.log('aguardando vite...');
    await waitForServer(`http://localhost:${String(PORT)}/`);
    console.log('vite no ar; abrindo chrome...');

    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({
      viewport: { width: 390, height: 780 },
      deviceScaleFactor: 2,
    });

    for (let i = 0; i < SCENES.length; i += 1) {
      console.log(`cena ${String(i)}...`);
      // A full reload per scene sidesteps StrictMode's double-mount race on
      // the ready flag; networkidle plus a settle beat is enough for the GPU.
      // The `?v=` forces a full reload: navigating to a URL that differs only
      // in the fragment would not reload, leaving every scene showing the
      // first one.
      await page.goto(`http://localhost:${String(PORT)}/?v=${String(i)}#topdown&scene=${String(i)}`, {
        waitUntil: 'networkidle',
      });
      await page
        .waitForFunction(() => document.querySelector('[data-topdown]')?.dataset.ready === 'true', {
          timeout: 12000,
        })
        .catch(() => console.log('  (aviso: ready nao sinalizado, seguindo)'));
      await page.waitForTimeout(400);

      const name = `topdown-${String(i)}-${SCENES[i]}.png`;
      await page.screenshot({ path: join(OUT, name) });
      console.log(name);
    }

    await browser.close();
    console.log(`\n${String(SCENES.length)} cenas em .preview/`);
  } finally {
    vite.kill();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
