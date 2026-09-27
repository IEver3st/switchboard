import {
  Activity,
  ArrowDownToLine,
  ArrowLeft,
  Blocks,
  Film,
  Gamepad2,
  Headphones,
  LifeBuoy,
  SlidersHorizontal,
  Settings2,
  Video,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, useRef, type KeyboardEvent } from 'react';
import type { SystemSnapshot } from '../../../../shared/contracts';
import { appUpdatePhase } from '@/components/shared/app-update-indicator';
import { cn } from '@/lib/cn';
import { FeedbackDialog } from './feedback-dialog';
import {
  settingsCategoryGroups,
  visibleSettingsCategories,
  type SettingsCategoryId,
} from './settings-catalog';
import { useNewSettings } from './settings-new';

export const settingsCategoryIcons: Record<SettingsCategoryId, LucideIcon> = {
  general: Settings2,
  updates: ArrowDownToLine,
  modules: Blocks,
  capture: Video,
  clips: Film,
  games: Gamepad2,
  setup: SlidersHorizontal,
  audio: Headphones,
  diagnostics: Activity,
  about: LifeBuoy,
};

export function SettingsSidebar({
  category,
  snapshot,
  onCategoryChange,
  onBack,
}: {
  category: SettingsCategoryId | null;
  snapshot: SystemSnapshot;
  onCategoryChange: (category: SettingsCategoryId) => void;
  onBack: () => void;
}) {
  const navigationRef = useRef<HTMLElement>(null);
  const developerMode = snapshot.settings.developerMode === true;
  const visibleCategories = useMemo(() => visibleSettingsCategories({ developerMode }), [developerMode]);
  const { categoryHasUnseen } = useNewSettings();
  const updatePhase = appUpdatePhase(snapshot);
  const updateStatus = updatePhase === 'ready'
    ? 'Ready'
    : updatePhase === 'downloading' || updatePhase === 'installing'
      ? `${Math.round(snapshot.appUpdate.downloadProgress ?? 0)}%`
      : updatePhase === 'available'
        ? 'Available'
        : null;

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
      <nav ref={navigationRef} aria-label="Settings categories" onKeyDown={handleNavigationKeyDown} className="settings-categories">
        {settingsCategoryGroups.map((group) => {
          const items = visibleCategories.filter((item) => item.group === group.id);
          if (items.length === 0) return null;
          return (
            <div key={group.id} className="settings-categories__group" role="group" aria-labelledby={`settings-group-${group.id}`}>
              <div id={`settings-group-${group.id}`} className="settings-sidebar__label">{group.label}</div>
              <div className="settings-categories__list">
                {items.map((item) => (
                  <SettingsCategoryLink
                    key={item.id}
                    id={item.id}
                    label={item.label}
                    active={category === item.id}
                    hasNew={categoryHasUnseen(item.id)}
                    status={item.id === 'updates' ? updateStatus : null}
                    onClick={() => onCategoryChange(item.id)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="settings-sidebar__footer">
        <button type="button" className="settings-back no-drag" onClick={onBack} title="Back (Esc)">
          <ArrowLeft aria-hidden />
          <span>Back</span>
        </button>
        <FeedbackDialog />
      </div>
    </aside>
  );
}

function SettingsCategoryLink({
  id,
  label,
  active,
  hasNew,
  status,
  onClick,
}: {
  id: SettingsCategoryId;
  label: string;
  active: boolean;
  hasNew: boolean;
  status: string | null;
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
      {status ? (
        <small className="settings-category-link__status" data-settings-update-status>
          <span className="sr-only">Update </span>{status}
        </small>
      ) : hasNew ? (
        <span className="settings-new-dot" data-new-setting-dot>
          <span className="sr-only">Has new settings</span>
        </span>
      ) : null}
    </button>
  );
}
