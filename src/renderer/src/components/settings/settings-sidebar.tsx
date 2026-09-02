import {
  Activity,
  ArrowLeft,
  Blocks,
  Download,
  Film,
  Gamepad2,
  Headphones,
  Info,
  Search,
  Settings2,
  Video,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, useRef, type KeyboardEvent, type RefObject } from 'react';
import type { AppUpdateState } from '../../../../shared/contracts';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';
import { FeedbackDialog } from './feedback-dialog';
import {
  categoryLabel,
  searchSettings,
  settingsCategories,
  type SettingsCategoryId,
  type SettingsSearchEntry,
} from './settings-catalog';

export const settingsCategoryIcons: Record<SettingsCategoryId, LucideIcon> = {
  general: Settings2,
  audio: Headphones,
  capture: Video,
  clips: Film,
  games: Gamepad2,
  modules: Blocks,
  diagnostics: Activity,
  about: Info,
};

export function SettingsSidebar({
  category,
  appUpdate,
  query,
  searchInputRef,
  onCategoryChange,
  onQueryChange,
  onResultSelect,
  onBack,
}: {
  category: SettingsCategoryId;
  appUpdate: AppUpdateState;
  query: string;
  searchInputRef: RefObject<HTMLInputElement | null>;
  onCategoryChange: (category: SettingsCategoryId) => void;
  onQueryChange: (query: string) => void;
  onResultSelect: (result: SettingsSearchEntry) => void;
  onBack: () => void;
}) {
  const navigationRef = useRef<HTMLElement>(null);
  const results = useMemo(() => searchSettings(query), [query]);
  const hasQuery = query.trim().length > 0;
  const pendingUpdate = ['available', 'downloading', 'downloaded'].includes(appUpdate.status);
  const pendingUpdateLabel = appUpdate.status === 'downloaded'
    ? `Switchboard ${appUpdate.availableVersion ?? 'update'} is ready to install`
    : appUpdate.status === 'downloading'
      ? `Downloading Switchboard ${appUpdate.availableVersion ?? 'update'}`
      : `Switchboard ${appUpdate.availableVersion ?? 'update'} is available`;
  const pendingUpdateSummary = appUpdate.status === 'downloaded'
    ? 'Update ready'
    : appUpdate.status === 'downloading'
      ? 'Downloading update'
      : 'Update available';

  const handleNavigationKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const buttons = [...(navigationRef.current?.querySelectorAll<HTMLButtonElement>('[data-settings-category]') ?? [])];
    const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (currentIndex < 0) return;
    event.preventDefault();
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? buttons.length - 1
        : event.key === 'ArrowDown'
          ? (currentIndex + 1) % buttons.length
          : (currentIndex - 1 + buttons.length) % buttons.length;
    buttons[nextIndex]?.focus();
  };

  return (
    <aside className="settings-sidebar" aria-label="Settings navigation">
      <div className="settings-search">
        <Search className="settings-search__icon" aria-hidden />
        <Input
          ref={searchInputRef}
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
          }}
          placeholder="Search settings"
          aria-label="Search settings"
          className="settings-search__input"
        />
        {query ? (
          <button type="button" className="settings-search__clear" onClick={() => onQueryChange('')} aria-label="Clear settings search">
            <X className="size-3" aria-hidden />
          </button>
        ) : null}
      </div>

      {hasQuery ? (
        <div className="settings-results" aria-live="polite">
          <div className="settings-sidebar__label">{results.length === 1 ? '1 result' : `${results.length} results`}</div>
          {results.length > 0 ? (
            <div className="settings-results__list">
              {results.map((result) => (
                <button
                  key={result.id}
                  type="button"
                  data-settings-result
                  className="settings-result"
                  onClick={() => onResultSelect(result)}
                >
                  <span className="settings-result__title">{result.title}</span>
                  <span className="settings-result__category">{categoryLabel(result.category)}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="settings-results__empty">No settings match “{query.trim()}”.</p>
          )}
        </div>
      ) : null}

      <nav ref={navigationRef} aria-label="Settings categories" onKeyDown={handleNavigationKeyDown} className="settings-categories">
        <div className="settings-sidebar__label">Categories</div>
        <div className="settings-categories__list">
          {settingsCategories.map((item) => (
            <SettingsCategoryLink
              key={item.id}
              id={item.id}
              label={item.label}
              active={category === item.id}
              onClick={() => onCategoryChange(item.id)}
            />
          ))}
        </div>
      </nav>

      <div className="settings-sidebar__footer">
        {pendingUpdate ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="settings-update-indicator no-drag"
                data-settings-update-indicator
                aria-label={`${pendingUpdateLabel}. Open update settings.`}
                onClick={() => onCategoryChange('about')}
              >
                <span className="settings-update-indicator__icon" aria-hidden>
                  <Download />
                  <span className="settings-update-indicator__dot" />
                </span>
                <span className="settings-update-indicator__label">{pendingUpdateSummary}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" align="center">
              {pendingUpdateLabel}. Open update settings.
            </TooltipContent>
          </Tooltip>
        ) : null}
        <FeedbackDialog />
        <button type="button" className="settings-back no-drag" onClick={onBack} title="Back (Esc)">
          <ArrowLeft aria-hidden />
          <span>Back</span>
        </button>
      </div>
    </aside>
  );
}

function SettingsCategoryLink({
  id,
  label,
  active,
  onClick,
}: {
  id: SettingsCategoryId;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = settingsCategoryIcons[id];
  return (
    <button
      type="button"
      data-settings-category={id}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      className={cn('settings-category-link', active && 'settings-category-link--active')}
    >
      <Icon aria-hidden />
      <span>{label}</span>
    </button>
  );
}
