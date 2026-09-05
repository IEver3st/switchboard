import { useMemo, useState, type ComponentType, type ReactNode } from 'react';
import {
  ChevronRight,
  Code2,
  Download,
  ExternalLink,
  Keyboard,
  LoaderCircle,
  Mic,
  MonitorUp,
  Mouse,
  Puzzle,
  RefreshCw,
  Search,
  Unlink,
  Usb,
  Video,
  Volume2,
  X,
} from 'lucide-react';
import type {
  Device,
  ModuleKind,
  ModuleManifest,
  ModuleRuntimeStatus,
  SystemSnapshot,
} from '../../../../shared/contracts';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
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

export function ModuleManagement({
  snapshot,
  onOpenDeveloperTools,
}: {
  snapshot: SystemSnapshot;
  onOpenDeveloperTools: () => void;
}) {
  const [query, setQuery] = useState('');
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const [pendingModuleId, setPendingModuleId] = useState<string | null>(null);
  const setModuleState = useSystemStore((state) => state.setModuleState);
  const installed = snapshot.modules.filter((module) => module.installed);
  const available = snapshot.modules.filter((module) => !module.installed && module.source === 'bundled');
  const selectedModule = snapshot.modules.find((module) => module.id === selectedModuleId) ?? null;
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleInstalled = useMemo(
    () => installed.filter((module) => moduleMatchesQuery(module, snapshot.devices, normalizedQuery)),
    [installed, normalizedQuery, snapshot.devices],
  );
  const visibleAvailable = useMemo(
    () => available.filter((module) => moduleMatchesQuery(module, snapshot.devices, normalizedQuery)),
    [available, normalizedQuery, snapshot.devices],
  );
  const resultCount = visibleInstalled.length + visibleAvailable.length;

  const changeModuleState = async (module: ModuleManifest, enabled: boolean) => {
    if (pendingModuleId) return;
    setPendingModuleId(module.id);
    try {
      await setModuleState({ moduleId: module.id, enabled });
    } finally {
      setPendingModuleId(null);
    }
  };

  return (
    <>
      <div className="module-manager__toolbar">
        <div className="module-manager__search">
          <Search aria-hidden />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search modules…"
            aria-label="Search modules"
            data-module-search
          />
          {query ? (
            <button type="button" onClick={() => setQuery('')} aria-label="Clear module search">
              <X aria-hidden />
            </button>
          ) : null}
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={onOpenDeveloperTools} data-module-developer-tools>
          <Code2 aria-hidden />
          Developer tools
        </Button>
      </div>

      {normalizedQuery && resultCount === 0 ? (
        <div className="module-manager__empty" role="status">
          <Search aria-hidden />
          <strong>No modules found</strong>
          <span>Try a module, device, vendor, or capability name.</span>
        </div>
      ) : (
        <div className="module-manager__lists" aria-live="polite">
          {visibleInstalled.length > 0 || !normalizedQuery ? (
            <ModuleListSection title="Installed" count={visibleInstalled.length} settingId="modules.installed">
              {visibleInstalled.length > 0 ? visibleInstalled.map((module) => (
                <ModuleRow
                  key={module.id}
                  module={module}
                  developerMode={snapshot.settings.developerMode === true}
                  devices={devicesForModule(module, snapshot.devices)}
                  pending={pendingModuleId === module.id}
                  onOpen={() => setSelectedModuleId(module.id)}
                  onStateChange={(enabled) => void changeModuleState(module, enabled)}
                />
              )) : (
                <ModuleListEmpty>There are no installed modules.</ModuleListEmpty>
              )}
            </ModuleListSection>
          ) : null}

          {visibleAvailable.length > 0 || !normalizedQuery ? (
            <ModuleListSection title="Available" count={visibleAvailable.length} settingId="modules.available">
              {visibleAvailable.length > 0 ? visibleAvailable.map((module) => (
                <ModuleRow
                  key={module.id}
                  module={module}
                  developerMode={snapshot.settings.developerMode === true}
                  devices={devicesForModule(module, snapshot.devices)}
                  pending={pendingModuleId === module.id}
                  onOpen={() => setSelectedModuleId(module.id)}
                  onStateChange={(enabled) => void changeModuleState(module, enabled)}
                />
              )) : (
                <ModuleListEmpty>No additional compatible modules are available for this setup.</ModuleListEmpty>
              )}
            </ModuleListSection>
          ) : null}
        </div>
      )}

      <ModuleDetailsDialog
        module={selectedModule}
        snapshot={snapshot}
        pending={selectedModule?.id === pendingModuleId}
        onOpenChange={(open) => { if (!open) setSelectedModuleId(null); }}
        onStateChange={(enabled) => selectedModule && void changeModuleState(selectedModule, enabled)}
        onOpenDeveloperTools={onOpenDeveloperTools}
      />
    </>
  );
}

export function LocalModuleProjects({ snapshot }: { snapshot: SystemSnapshot }) {
  const [linkPending, setLinkPending] = useState(false);
  const setModuleState = useSystemStore((state) => state.setModuleState);
  const linkModuleProject = useSystemStore((state) => state.linkModuleProject);
  const local = snapshot.modules.filter((module) => module.source === 'local');

  const linkProject = async () => {
    if (linkPending) return;
    setLinkPending(true);
    try {
      await linkModuleProject();
    } finally {
      setLinkPending(false);
    }
  };

  return (
    <section className="developer-projects" aria-labelledby="developer-projects-title">
      <div className="developer-section-heading">
        <div>
          <h3 id="developer-projects-title">Local projects</h3>
          <p>Validate and run linked module projects in the isolated Module Host.</p>
        </div>
        <Button type="button" variant="secondary" size="sm" disabled={linkPending} onClick={() => void linkProject()} data-module-link>
          <ExternalLink aria-hidden />
          {linkPending ? 'Linking…' : 'Link existing project'}
        </Button>
      </div>
      <div className="developer-projects__list">
        {local.length === 0 ? (
          <div id="setting-modules.local" data-setting-id="modules.local" tabIndex={-1} className="module-local-empty">
            <span>No local projects linked</span>
            <p>Link an existing folder or create a starter project below.</p>
          </div>
        ) : local.map((module, index) => (
          <LocalModuleRow
            key={module.id}
            module={module}
            settingId={index === 0 ? 'modules.local' : `modules.local.${module.id}`}
            onToggle={(enabled) => setModuleState({ moduleId: module.id, enabled })}
          />
        ))}
      </div>
    </section>
  );
}

function ModuleListSection({
  title,
  count,
  settingId,
  children,
}: {
  title: string;
  count: number;
  settingId: string;
  children: ReactNode;
}) {
  const headingId = `module-section-${title.toLocaleLowerCase()}`;
  return (
    <section id={`setting-${settingId}`} data-setting-id={settingId} tabIndex={-1} className="module-list-section" aria-labelledby={headingId}>
      <div className="module-list-section__heading">
        <h3 id={headingId}>{title}</h3>
        <span>{count}</span>
      </div>
      <div className="module-list">{children}</div>
    </section>
  );
}

function ModuleRow({
  module,
  developerMode,
  devices,
  pending,
  onOpen,
  onStateChange,
}: {
  module: ModuleManifest;
  developerMode: boolean;
  devices: Device[];
  pending: boolean;
  onOpen: () => void;
  onStateChange: (enabled: boolean) => void;
}) {
  const Icon = moduleIcon(module);
  const available = !module.installed;
  const developerLocked = module.kind === 'audio' && module.source !== 'local' && !developerMode && !module.enabled;
  const canChangeState = !developerLocked && moduleCanChangeState(module);
  const meta = moduleMetadata(module);
  const detectedDevice = devices[0]?.displayName;

  return (
    <div className="module-list-row" data-module-row={module.id}>
      <button type="button" className="module-list-row__main" onClick={onOpen} aria-label={`View ${module.name} details`}>
        <span className={`module-list-row__icon module-list-row__icon--${moduleIconTone(module)}`} aria-hidden>
          <Icon />
        </span>
        <span className="module-list-row__copy">
          <strong>{module.name}</strong>
          <span className="module-list-row__description">{module.description}</span>
          <span className="module-list-row__meta">
            {meta}{detectedDevice ? ` · ${detectedDevice}` : ''}
          </span>
        </span>
        <ChevronRight className="module-list-row__chevron" aria-hidden />
      </button>
      <div className="module-list-row__action">
        {available ? (
          <Button
            type="button"
            variant="primary"
            size="sm"
            className="module-list-row__install"
            disabled={pending || !canChangeState}
            onClick={() => onStateChange(true)}
            aria-label={`Install ${module.name}`}
            data-module-install={module.id}
          >
            {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Download aria-hidden />}
            {pending ? 'Installing…' : 'Install'}
          </Button>
        ) : (
          <>
            <span className="module-list-row__state" aria-live="polite">
              {pending ? 'Updating…' : developerLocked ? 'Developer mode required' : moduleStateLabel(module)}
            </span>
            <Switch
              checked={module.enabled}
              disabled={pending || !canChangeState}
              aria-label={`${module.enabled ? 'Disable' : 'Enable'} ${module.name}`}
              title={developerLocked ? 'Enable Developer mode in Settings > General to use Audio.' : undefined}
              onCheckedChange={onStateChange}
              data-module-toggle={module.id}
              className="no-drag"
            />
          </>
        )}
      </div>
    </div>
  );
}

function ModuleDetailsDialog({
  module,
  snapshot,
  pending,
  onOpenChange,
  onStateChange,
  onOpenDeveloperTools,
}: {
  module: ModuleManifest | null;
  snapshot: SystemSnapshot;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onStateChange: (enabled: boolean) => void;
  onOpenDeveloperTools: () => void;
}) {
  if (!module) return null;
  const Icon = moduleIcon(module);
  const devices = devicesForModule(module, snapshot.devices);
  const developer = module.author;
  const status = module.development?.status;
  const developerLocked = module.kind === 'audio' && module.source !== 'local' && snapshot.settings.developerMode !== true && !module.enabled;
  const canChangeState = !developerLocked && moduleCanChangeState(module);

  const openDeveloperTools = () => {
    onOpenChange(false);
    onOpenDeveloperTools();
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent
        className="module-details-dialog no-drag"
        data-module-details={module.id}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (event.currentTarget as HTMLElement | null)
            ?.querySelector<HTMLButtonElement>('button[aria-label="Close"]')
            ?.focus();
        }}
      >
        <DialogHeader className="module-details-dialog__header">
          <span className={`module-details-dialog__icon module-list-row__icon--${moduleIconTone(module)}`} aria-hidden><Icon /></span>
          <div>
            <DialogTitle>{module.name}</DialogTitle>
            <DialogDescription>{module.description}</DialogDescription>
          </div>
        </DialogHeader>

        <div className="module-details-dialog__body">
          <section aria-labelledby="module-detail-overview">
            <h3 id="module-detail-overview">Overview</h3>
            <dl className="module-detail-list">
              <ModuleDetail label="Version" value={`v${module.version}`} mono />
              <ModuleDetail label="Source" value={moduleSourceLabel(module)} />
              <ModuleDetail label="Type" value={kindLabels[module.kind]} />
              <ModuleDetail label="Installed size" value={formatModuleSize(module.sizeMb)} />
              {developer ? <ModuleDetail label="Developer" value={developer} /> : null}
              {status ? <ModuleDetail label="Project status" value={statusLabels[status]} /> : null}
            </dl>
          </section>

          <section aria-labelledby="module-detail-support">
            <h3 id="module-detail-support">Support</h3>
            <dl className="module-detail-list module-detail-list--wide">
              <ModuleDetail
                label="Detected devices"
                value={devices.length > 0 ? devices.map((device) => device.displayName).join(', ') : 'None detected in this setup'}
              />
              <ModuleDetail label="Capabilities" value={formatCapabilities(module.capabilities)} />
              <ModuleDetail label="Runtime boundary" value={moduleRuntimeBoundary(module)} />
              <ModuleDetail
                label="Updates"
                value={module.source === 'local'
                  ? 'Local projects are never changed automatically'
                  : snapshot.settings.automaticModuleUpdates
                    ? 'Automatic signed-package updates enabled'
                    : 'Automatic module updates disabled'}
              />
            </dl>
          </section>

          <section className="module-details-dialog__diagnostics" aria-labelledby="module-detail-diagnostics">
            <h3 id="module-detail-diagnostics">Diagnostics</h3>
            <dl className="module-detail-list module-detail-list--wide">
              <ModuleDetail label="Module ID" value={module.id} mono />
              {module.vendors.length > 0 ? <ModuleDetail label="Vendor IDs" value={module.vendors.join(', ')} mono /> : null}
              {module.development?.projectPath ? <ModuleDetail label="Project path" value={module.development.projectPath} mono /> : null}
              {module.development?.lastValidatedAt ? (
                <ModuleDetail label="Last validated" value={new Date(module.development.lastValidatedAt).toLocaleString()} />
              ) : null}
            </dl>
          </section>
        </div>

        <div className="module-details-dialog__footer">
          {module.source === 'local' ? (
            <Button type="button" variant="secondary" size="sm" onClick={openDeveloperTools}>
              <Code2 aria-hidden />
              Manage project
            </Button>
          ) : <span />}
          {module.installed ? (
            <label className="module-details-dialog__toggle">
              <span>{pending ? 'Updating…' : developerLocked ? 'Developer mode required' : moduleStateLabel(module)}</span>
              <Switch
                checked={module.enabled}
                disabled={pending || !canChangeState}
                aria-label={`${module.enabled ? 'Disable' : 'Enable'} ${module.name}`}
                title={developerLocked ? 'Enable Developer mode in Settings > General to use Audio.' : undefined}
                onCheckedChange={onStateChange}
              />
            </label>
          ) : (
            <Button type="button" variant="primary" size="sm" disabled={pending || !canChangeState} onClick={() => onStateChange(true)}>
              {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Download aria-hidden />}
              {pending ? 'Installing…' : 'Install module'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ModuleDetail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className={mono ? 'module-detail-list__mono' : undefined} title={value}>{value}</dd>
    </div>
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
    try { await validateModuleProject({ moduleId: module.id }); }
    finally { setPending(null); }
  };
  const open = async () => {
    setPending('open');
    try { await revealModuleProject({ moduleId: module.id }); }
    finally { setPending(null); }
  };
  const unlink = async () => {
    setPending('unlink');
    try { await unlinkModuleProject({ moduleId: module.id }); }
    finally { setPending(null); }
  };
  const toggle = async (enabled: boolean) => {
    setPending('toggle');
    try { await onToggle(enabled); }
    finally { setPending(null); }
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
              <MonitorUp aria-hidden />
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

function ModuleListEmpty({ children }: { children: ReactNode }) {
  return <p className="module-list__empty">{children}</p>;
}

function devicesForModule(module: ModuleManifest, devices: readonly Device[]): Device[] {
  return devices.filter((device) => device.moduleId === module.id);
}

function moduleMatchesQuery(module: ModuleManifest, devices: readonly Device[], query: string): boolean {
  if (!query) return true;
  const deviceText = devicesForModule(module, devices).flatMap((device) => [
    device.displayName,
    device.kind,
    device.identity.manufacturer,
    device.identity.model,
    device.identity.productFamily,
  ]);
  const haystack = [
    module.name,
    module.description,
    module.author,
    module.id,
    kindLabels[module.kind],
    module.official ? 'official' : 'community',
    ...module.capabilities,
    ...module.vendors,
    ...deviceText,
  ].filter(Boolean).join(' ').toLocaleLowerCase();
  return query.split(/\s+/).every((term) => haystack.includes(term));
}

function moduleMetadata(module: ModuleManifest): string {
  return [
    module.official ? 'Official' : 'Community',
    module.source === 'local' ? 'Local project' : kindLabels[module.kind],
    `v${module.version}`,
  ].join(' · ');
}

function moduleSourceLabel(module: ModuleManifest): string {
  if (module.source === 'local') return 'Linked local project';
  return module.official ? 'Official bundled module' : 'Community bundled module';
}

function moduleRuntimeBoundary(module: ModuleManifest): string {
  if (module.source === 'local') return 'Sandboxed Chromium with declared HID metadata only';
  if (module.kind === 'device') return 'Core-managed device protocol boundary';
  if (module.kind === 'capture') return 'Isolated Capture host';
  if (module.kind === 'audio') return 'Isolated Audio host';
  return 'Core-managed integration boundary';
}

function moduleCanChangeState(module: ModuleManifest): boolean {
  if (module.source !== 'local' || module.enabled) return true;
  return ['ready', 'active'].includes(module.development?.status ?? 'invalid');
}

function moduleStateLabel(module: ModuleManifest): string {
  if (module.enabled) return 'Enabled';
  if (module.source === 'local' && !moduleCanChangeState(module)) {
    return statusLabels[module.development?.status ?? 'invalid'];
  }
  return 'Off';
}

function formatCapabilities(capabilities: readonly string[]): string {
  if (capabilities.length === 0) return 'No capabilities declared';
  return capabilities.map((capability) => capability.replaceAll('-', ' ')).join(', ');
}

function moduleIcon(module: ModuleManifest): ComponentType<{ className?: string }> {
  if (module.id.includes('razer-huntsman')) return Keyboard;
  if (module.id.includes('quadcast')) return Mic;
  if (module.id.includes('logitech')) return Mouse;
  if (module.id.includes('replay')) return Video;
  if (module.id.includes('audio-router')) return Volume2;
  if (module.id.includes('steelseries')) return Usb;
  if (module.kind === 'integration') return Puzzle;
  if (module.kind === 'capture') return Video;
  if (module.kind === 'audio') return Volume2;
  return Usb;
}

function moduleIconTone(module: ModuleManifest): string {
  if (module.id.includes('quadcast')) return 'microphone';
  if (module.id.includes('logitech')) return 'device';
  if (module.kind === 'capture') return 'capture';
  if (module.kind === 'audio') return 'audio';
  if (module.kind === 'integration') return 'integration';
  return 'keyboard';
}

function formatModuleSize(sizeMb: number): string {
  if (sizeMb < 0.1) return '<0.1 MB';
  return `${Number.isInteger(sizeMb) ? sizeMb : sizeMb.toFixed(1)} MB`;
}
