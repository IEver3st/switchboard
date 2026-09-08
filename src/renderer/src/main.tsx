import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { TooltipProvider } from '@radix-ui/react-tooltip';
import { App } from './App';
import { QuickControls } from './components/setup/quick-controls';
import './globals.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TooltipProvider delayDuration={350}>
      {new URLSearchParams(window.location.search).get('quickControls') === '1' ? <QuickControls /> : <App />}
    </TooltipProvider>
  </StrictMode>,
);
