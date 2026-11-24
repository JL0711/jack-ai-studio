import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { reloadOnceForUpdate } from './lib/chunkErrors';
import '@fontsource-variable/hubot-sans/wdth.css';
import '@fontsource/dseg7-classic/700.css';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/pages.css';
import './styles/scenes.css';
import './styles/effects.css';

// Vite reports an on-demand file that failed to load (usually: the site was updated
// while this tab was open). Reload once to get the new page; RouteErrorBoundary
// shows a message if that doesn't help.
window.addEventListener('vite:preloadError', (event) => {
  if (reloadOnceForUpdate()) event.preventDefault();
});

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
