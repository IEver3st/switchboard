import { Download } from 'lucide-react';
import type { ModuleKind, ModuleManifest, SystemSnapshot } from '../../../../shared/contracts';
import { SettingRow, SettingSection } from '@/components/settings/settings-primitives';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useSystemStore } from '@/stores/use-system-store';

const kindLabels: Record<ModuleKind, string> = {
  device: 'Device',
  capture: 'Capture',
  audio: 'Audio',
  integration: 'Integration',
};

export function ModuleManagement({ snapshot }: { snapshot: SystemSnapshot }) {
  const setModuleState = useSystemStore((state) => state.setModuleState);
  const actionPending = useSystemStore((state) => state.actionPending);
  const installed = snapshot.modules.filter((module) => module.installed);
  const available = snapshot.modules.filter((module) => !module.installed);

  return (
    <>
      <SettingSection title={`Installed modules (${installed.length})`}>
        {installed.length === 0 ? (
          <ModuleEmptyRow
            settingId="modules.installed"
            title="No modules installed"
            description="Modules detected for this setup will remain available to install below."
          />
        ) : installed.map((module, index) => (
          <InstalledModuleRow
            key={module.id}
            module={module}
            settingId={index === 0 ? 'modules.installed' : `modules.installed.${module.id}`}
            pending={actionPending === `module:${module.id}`}
            onToggle={(enabled) => void setModuleState({ moduleId: module.id, enabled })}
          />
        ))}
      </SettingSection>

      <SettingSection title={`Available for this setup (${available.length})`}>
        {available.length === 0 ? (
          <ModuleEmptyRow
            settingId="modules.available"
            title="All detected modules are installed"
            description="New modules will appear here when Switchboard detects support for this setup."
          />
        ) : available.map((module, index) => (
          <AvailableModuleRow
            key={module.id}
            module={module}
            settingId={index === 0 ? 'modules.available' : `modules.available.${module.id}`}
            pending={actionPending === `module:${module.id}`}
            onInstall={() => void setModuleState({ moduleId: module.id, enabled: true })}
          />
        ))}
      </SettingSection>
    </>
  );
}

function InstalledModuleRow({
  module,
  settingId,
  pending,
  onToggle,
}: {
  module: ModuleManifest;
  settingId: string;
  pending: boolean;
  onToggle: (enabled: boolean) => void;
}) {
  return (
    <SettingRow
      settingId={settingId}
      title={module.name}
      description={<ModuleDescription module={module} />}
      className="settings-row--module"
      controlClassName="settings-row__control--actions settings-module-control"
    >
      <span className="settings-module-status" aria-live="polite">
        {pending ? 'Applying…' : module.enabled ? 'Enabled' : 'Off'}
      </span>
      <Switch
        checked={module.enabled}
        disabled={pending}
        aria-label={`${module.enabled ? 'Disable' : 'Enable'} ${module.name}`}
        onCheckedChange={onToggle}
        className="no-drag"
      />
    </SettingRow>
  );
}

function AvailableModuleRow({
  module,
  settingId,
  pending,
  onInstall,
}: {
  module: ModuleManifest;
  settingId: string;
  pending: boolean;
  onInstall: () => void;
}) {
  return (
    <SettingRow
      settingId={settingId}
      title={module.name}
      description={<ModuleDescription module={module} />}
      className="settings-row--module"
    >
      <Button
        type="button"
        size="sm"
        variant="primary"
        disabled={pending}
        onClick={onInstall}
        aria-label={`Install ${module.name}`}
        className="h-7 min-w-[88px] gap-1.5 px-3 text-[11px] no-drag"
      >
        <Download className="size-3.5" aria-hidden />
        {pending ? 'Installing…' : 'Install'}
      </Button>
    </SettingRow>
  );
}

function ModuleDescription({ module }: { module: ModuleManifest }) {
  const metadata = [
    module.official ? 'Official' : 'Community',
    kindLabels[module.kind],
    formatModuleSize(module.sizeMb),
    `v${module.version}`,
    module.restartRequired ? 'Restart required' : null,
  ].filter(Boolean).join(' · ');

  return (
    <>
      {module.description}{' '}
      <span className="settings-module-meta">{metadata}</span>
    </>
  );
}

function ModuleEmptyRow({ settingId, title, description }: { settingId: string; title: string; description: string }) {
  return (
    <SettingRow settingId={settingId} title={title} description={description} className="settings-row--module">
      <span className="settings-row__value">None</span>
    </SettingRow>
  );
}

function formatModuleSize(sizeMb: number): string {
  return `${Number.isInteger(sizeMb) ? sizeMb : sizeMb.toFixed(1)} MB`;
}
