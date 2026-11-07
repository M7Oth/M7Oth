import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { useGame } from './store';
import { applyDir } from './i18n';
import { MainMenu, CreateCharacter, openLocal, openRemote } from './ui/Menu';
import { HUD } from './ui/HUD';
import { World } from './scene/World';
import './styles.css';

function App() {
  const screen = useGame((s) => s.screen);
  const state = useGame((s) => s.state);
  const lang = useGame((s) => s.settings.lang);
  useEffect(() => { applyDir(lang); }, [lang]);
  if (screen === 'menu') return <MainMenu />;
  if (screen === 'create') return <CreateCharacter />;
  return (
    <div className="game">
      {state && <World />}
      <HUD />
    </div>
  );
}

// test/debug hook (read-only access + helpers used by the automated end-to-end scenario)
(window as any).__fls = { useGame, openLocal, openRemote };

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
