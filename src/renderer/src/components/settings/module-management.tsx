import { useState } from 'react';
import { Download, ExternalLink, RefreshCw, Unlink } from 'lucide-react';
import type { ModuleKind, ModuleManifest, ModuleRuntimeStatus, SystemSnapshot } from '../../../../shared/contracts';
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

const statusLabels: Record<ModuleRuntimeStatus, string> = {
  ready: 'Ready',
  validating: 'Validating',
  active: 'Active',
  invalid: 'Needs work',
  incompatible: 'Incompatible',
  missing: 'Project missing',
  'runtime-error': 'Runtime stopped',
};

export function ModuleManagement({ snapshot }: { snapshot: SystemSnapshot }) {
  const setModuleState = useSystemStore((state) => state.setModuleState);
  const local = snapshot.modules.filter((module) => module.source === 'local');
  const installed = snapshot.modules.filter((module) => module.source === 'bundled' && module.installed);
  const available = snapshot.modules.filter((module) => module.source === 'bundled' && !module.installed);

  return (
    <>
      <SettingSection title={`Local projects (${local.length})`}>
        {local.length === 0 ? (
          <div id="setting-modules.local" data-setting-id="modules.local" tabIndex={-1} className="module-local-empty">
            <span>No local projects linked</span>
            <p>Create a starter above or link a folder containing switchboard.module.json.</p>
          </div>
        ) : local.map((module, index) => (
          <LocalModuleRow
            key={module.id}
            module={module}
            settingId={index === 0 ? 'modules.local' : `modules.local.${module.id}`}
            onToggle={(enabled) => setModuleState({ moduleId: module.id, enabled })}
          />
        ))}
      </SettingSection>

      <SettingSection title={`Bundled modules (${installed.length})`}>
        {installed.map((module, index) => (
          <BundledModuleRow
            key={module.id}
            module={module}
            settingId={index === 0 ? 'modules.installed' : `modules.installed.${module.id}`}
            onToggle={(enabled) => void setModuleState({ moduleId: module.id, enabled })}
          />
        ))}
      </SettingSection>

      {available.length > 0 ? (
        <SettingSection title={`Available for this setup (${available.length})`}>
          {available.map((module, index) => (
            <AvailableModuleRow
              key={module.id}
              module={module}
              settingId={index === 0 ? 'modules.available' : `modules.available.${module.id}`}
              onInstall={() => void setModuleState({ moduleId: module.id, enabled: true })}
            />
          ))}
        </SettingSection>
      ) : null}
    </>
  );
}

function LocalModuleRow({
  module,
  settingId,
  onToggle,
}: {
  module: ModuleManifest;
  settingId: string;
  onToggle: (enabled: boolean) => Promise<void>;
}) {
  const [confirmingUnlink, setConfirmingUnlink] = useState(false);
  const [pending, setPending] = useState<'validate' | 'open' | 'unlink' | 'toggle' | null>(null);
  const validateModuleProject = useSystemStore((state) => state.validateModuleProject);
  const revealModuleProject = useSystemStore((state) => state.revealModuleProject);
  const unlinkModuleProject = useSystemStore((state) => state.unlinkModuleProject);
  const status = module.development?.status ?? 'invalid';
  const blockingIssue = module.development?.issues.find((issue) => issue.severity === 'error');
  const canEnable = ['ready', 'active'].includes(status);

  const validate = async () => {
    setPending('validate');
    await validateModuleProject({ moduleId: module.id });
    setPending(null);
  };
  const open = async () => {
    setPending('open');
    await revealModuleProject({ moduleId: module.id });
    setPending(null);
  };
  const unlink = async () => {
    setPending('unlink');
    await unlinkModuleProject({ moduleId: module.id });
    setPending(null);
  };
  const toggle = async (enabled: boolean) => {
    setPending('toggle');
    await onToggle(enabled);
    setPending(null);
  };

  return (
    <div id={`setting-${settingId}`} data-setting-id={settingId} data-module-project={module.id} tabIndex={-1} className="module-project-row">
      <div className="module-project-row__primary">
        <div className="module-project-row__title">
          <strong>{module.name}</strong>
          <ModuleStatus status={status} />
        </div>
        <p>{blockingIssue?.message ?? module.description}</p>
        <span className="module-project-row__path" title={module.development?.projectPath}>{module.development?.projectPath}</span>
      </div>
      <div className="module-project-row__actions">
        {confirmingUnlink ? (
          <div className="module-unlink-confirmation" role="group" aria-label={`Unlink ${module.name}`}>
            <span>Keep files; remove link?</span>
            <Button type="button" variant="ghost" size="sm" disabled={pending !== null} onClick={() => setConfirmingUnlink(false)}>Cancel</Button>
            <Button type="button" variant="danger" size="sm" disabled={pending !== null} onClick={() => void unlink()}>
              {pending === 'unlink' ? 'Unlinking…' : 'Unlink'}
            </Button>
          </div>
        ) : (
          <>
            <Button type="button" variant="ghost" size="sm" disabled={pending !== null} data-module-validate onClick={() => void validate()} aria-label={`Validate ${module.name}`}>
              <RefreshCw className={pending === 'validate' ? 'animate-spin' : undefined} aria-hidden />
              Validate
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={pending !== null} onClick={() => void open()} aria-label={`Open ${module.name} project`}>
              <ExternalLink aria-hidden />
              Open
            </Button>
            <Button type="button" variant="ghost" size="icon" disabled={pending !== null} data-module-unlink onClick={() => setConfirmingUnlink(true)} aria-label={`Unlink ${module.name}`} title="Unlink project">
              <Unlink aria-hidden />
            </Button>
            <Switch
              checked={module.enabled}
              disabled={!canEnable || status === 'validating' || pending !== null}
              aria-label={`${module.enabled ? 'Disable' : 'Enable'} ${module.name}`}
              onCheckedChange={(enabled) => void toggle(enabled)}
              className="no-drag"
            />
          </>
        )}
      </div>
    </div>
  );
}

function BundledModuleRow({
  module,
  settingId,
  onToggle,
}: {
  module: ModuleManifest;
  settingId: string;
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
        {module.enabled ? 'Enabled' : module.kind === 'device' ? 'Off · devices hidden' : 'Off'}
      </span>
      <Switch
        checked={module.enabled}
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
  onInstall,
}: {
  module: ModuleManifest;
  settingId: string;
  onInstall: () => void;
}) {
  return (
    <SettingRow settingId={settingId} title={module.name} description={<ModuleDescription module={module} />} className="settings-row--module">
      <Button type="button" size="sm" variant="primary" onClick={onInstall} aria-label={`Install ${module.name}`} className="h-7 min-w-[88px] gap-1.5 px-3 text-[11px] no-drag">
        <Download className="size-3.5" aria-hidden />
        Install
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
  return <>{module.description} <span className="settings-module-meta">{metadata}</span></>;
}

function ModuleStatus({ status }: { status: ModuleRuntimeStatus }) {
  const tone = ['invalid', 'incompatible', 'missing', 'runtime-error'].includes(status)
    ? 'danger'
    : status === 'active'
      ? 'success'
      : status === 'validating'
        ? 'info'
        : 'neutral';
  return <span className={`module-runtime-status module-runtime-status--${tone}`}><i aria-hidden />{statusLabels[status]}</span>;
}

function formatModuleSize(sizeMb: number): string {
  if (sizeMb < 0.1) return '<0.1 MB';
  return `${Number.isInteger(sizeMb) ? sizeMb : sizeMb.toFixed(1)} MB`;
}
