import { useMemo, type KeyboardEvent, type RefObject } from 'react';
import { CornerDownLeft, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  categoryLabel,
  searchSettings,
  settingsCategories,
  type SettingsSearchEntry,
} from './settings-catalog';
import { NewSettingDot } from './settings-new';
import { settingsCategoryIcons } from './settings-sidebar';

export function SettingsSearchField({
  query,
  developerMode,
  inputRef,
  onQueryChange,
  onResultSelect,
}: {
  query: string;
  developerMode: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  onQueryChange: (query: string) => void;
  onResultSelect: (result: SettingsSearchEntry) => void;
}) {
  const results = useMemo(() => searchSettings(query, { developerMode }), [query, developerMode]);
  return (
    <div className="settings-search no-drag" role="search">
      <Search className="settings-search__icon" aria-hidden />
      <Input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && query) {
            event.preventDefault();
            onQueryChange('');
          }
          if (event.key === 'ArrowDown' && results.length > 0) {
            event.preventDefault();
            document.querySelector<HTMLButtonElement>('[data-settings-result]')?.focus();
          }
          if (event.key === 'Enter' && results[0]) {
            event.preventDefault();
            onResultSelect(results[0]);
          }
        }}
        placeholder="Search settings"
        aria-label="Search settings"
        aria-describedby="settings-search-shortcut"
        aria-controls={query.trim() ? 'settings-search-results' : undefined}
        className="settings-search__input"
        autoComplete="off"
        spellCheck={false}
      />
      {query ? (
        <button type="button" className="settings-search__clear" onClick={() => { onQueryChange(''); inputRef.current?.focus(); }} aria-label="Clear settings search">
          <X aria-hidden />
        </button>
      ) : (
        <kbd id="settings-search-shortcut" className="settings-search__shortcut" aria-label="Shortcut Control F">Ctrl F</kbd>
      )}
    </div>
  );
}

export function SettingsSearchResults({
  query,
  developerMode,
  inputRef,
  onResultSelect,
}: {
  query: string;
  developerMode: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  onResultSelect: (result: SettingsSearchEntry) => void;
}) {
  const results = useMemo(() => searchSettings(query, { developerMode }), [query, developerMode]);
  const groups = useMemo(() => settingsCategories
    .map((category) => ({ category, entries: results.filter((entry) => entry.category === category.id) }))
    .filter((group) => group.entries.length > 0), [results]);
  const trimmed = query.trim();

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('[data-settings-result]')];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0) return;
    event.preventDefault();
    if (event.key === 'ArrowUp' && index === 0) {
      inputRef.current?.focus();
      return;
    }
    const next = event.key === 'Home' ? 0
      : event.key === 'End' ? buttons.length - 1
      : event.key === 'ArrowDown' ? Math.min(buttons.length - 1, index + 1)
      : index - 1;
    buttons[next]?.focus();
  };

  return (
    <section id="settings-search-results" className="settings-search-results" aria-labelledby="settings-search-results-title" onKeyDown={handleKeyDown}>
      <header className="settings-search-results__header">
        <h2 id="settings-search-results-title">Results for “{trimmed}”</h2>
        <p role="status" aria-live="polite">
          {results.length === 0 ? 'No matching settings' : results.length === 1 ? '1 setting' : `${results.length} settings`}
        </p>
      </header>
      {results.length === 0 ? (
        <div className="settings-search-results__empty">
          <Search aria-hidden />
          <div>
            <strong>Nothing matches “{trimmed}”</strong>
            <p>Try a shorter or more general word, such as “tray”, “microphone”, or “shortcut”.</p>
          </div>
        </div>
      ) : (
        <div className="settings-search-results__groups">
          {groups.map(({ category, entries }) => {
            const Icon = settingsCategoryIcons[category.id];
            return (
              <div key={category.id} className="settings-search-results__group">
                <h3><Icon aria-hidden />{category.label}</h3>
                <ul>
                  {entries.map((entry) => (
                    <li key={entry.id}>
                      <button
                        type="button"
                        data-settings-result={entry.id}
                        className="settings-result"
                        onClick={() => onResultSelect(entry)}
                        aria-label={`${entry.title}, in ${categoryLabel(entry.category)}`}
                      >
                        <span className="settings-result__copy">
                          <span className="settings-result__title">{entry.title}<NewSettingDot settingId={entry.id} /></span>
                          <span className="settings-result__description">{entry.description}</span>
                        </span>
                        <CornerDownLeft className="settings-result__go" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
