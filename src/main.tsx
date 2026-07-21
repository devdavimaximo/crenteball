import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { requestPersistentStorage } from '@/persistence/storage';
import { App } from '@/ui/App';

import './index.css';

// Fire-and-forget: ask the browser not to evict our IndexedDB. A refusal is
// fine — file export is the real safety net (see src/persistence/README.md).
void requestPersistentStorage();

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element in index.html');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
