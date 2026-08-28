import { useMemo, useRef, useState } from 'react';
import { Blocks, FolderInput, ShieldCheck } from 'lucide-react';
import {
  createModuleProjectInputSchema,
  type CreateModuleProjectInput,
  type Device,
  type SystemSnapshot,
} from '../../../../shared/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSystemStore } from '@/stores/use-system-store';

type Draft = Record<keyof CreateModuleProjectInput, string>;

export function ModuleAuthoringWorkbench({ snapshot }: { snapshot: SystemSnapshot }) {
  const [draft, setDraft] = useState<Draft>(() => createInitialDraft(snapshot.devices));
  const [sourceDeviceId, setSourceDeviceId] = useState(() => initialSourceDeviceId(snapshot.devices));
  const [pendingAction, setPendingAction] = useState<'create' | 'link' | null>(null);
  const idEdited = useRef(false);
  const createModuleProject = useSystemStore((state) => state.createModuleProject);
  const linkModuleProject = useSystemStore((state) => state.linkModuleProject);
  const globalError = useSystemStore((state) => state.error);
  const eligibleDevices = snapshot.devices.filter(hasUsbIdentity);
  const parsedDraft = useMemo(() => createModuleProjectInputSchema.safeParse(draft), [draft]);
  const fieldErrors = useMemo(() => {
    if (parsedDraft.success) return new Map<string, string>();
    return new Map(parsedDraft.error.issues.map((issue) => [String(issue.path[0]), issue.message]));
  }, [parsedDraft]);
  const manifestPreview = previewManifest(draft, snapshot.version);

  const update = (key: keyof Draft, value: string) => {
    setDraft((current) => {
      const next = { ...current, [key]: value };
      if (key === 'name' && !idEdited.current) next.id = suggestedModuleId(value);
      return next;
    });
  };

  const chooseSourceDevice = (deviceId: string) => {
    setSourceDeviceId(deviceId);
    if (deviceId === 'manual') return;
    const device = eligibleDevices.find((candidate) => candidate.id === deviceId);
    if (!device) return;
    idEdited.current = false;
    setDraft(draftFromDevice(device));
  };

  const createProject = async () => {
    if (!parsedDraft.success) return;
    setPendingAction('create');
    await createModuleProject(parsedDraft.data);
    setPendingAction(null);
  };

  const linkProject = async () => {
    setPendingAction('link');
    await linkModuleProject();
    setPendingAction(null);
  };

  return (
    <section id="setting-modules.create" data-setting-id="modules.create" tabIndex={-1} className="module-workbench" aria-labelledby="module-workbench-title">
      <div className="module-workbench__editor">
        <div className="module-workbench__heading">
          <div>
            <span className="module-workbench__eyebrow">Module Host API v1</span>
            <h3 id="module-workbench-title">Build a device add-on</h3>
            <p>Create a runnable starter with its manifest, sandbox entrypoint, schema, tests, and author guide.</p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={pendingAction !== null}
            onClick={() => void linkProject()}
            data-module-link
            className="module-workbench__link no-drag"
          >
            <FolderInput aria-hidden />
            {pendingAction === 'link' ? 'Linking…' : 'Link existing'}
          </Button>
        </div>

        <form onSubmit={(event) => { event.preventDefault(); void createProject(); }}>
          <div className="module-workbench__fields">
            <ModuleSelectField
              label="Start from hardware"
              value={sourceDeviceId}
              onValueChange={chooseSourceDevice}
              className="module-field--wide"
              options={[
                ...eligibleDevices.map((device) => ({
                  value: device.id,
                  label: `${device.displayName} · ${hex(device.identity.vendorId!)}:${hex(device.identity.productId!)}`,
                })),
                { value: 'manual', label: 'Enter a VID and PID manually' },
              ]}
            />
            <ModuleSelectField
              label="Device type"
              value={draft.deviceKind}
              onValueChange={(value) => update('deviceKind', value)}
              options={[
                { value: 'mouse', label: 'Mouse' },
                { value: 'keyboard', label: 'Keyboard' },
                { value: 'microphone', label: 'Microphone' },
                { value: 'headset', label: 'Headset' },
                { value: 'unknown', label: 'Other device' },
              ]}
            />
            <ModuleTextField label="Module name" value={draft.name} error={fieldErrors.get('name')} onChange={(value) => update('name', value)} />
            <ModuleTextField
              label="Namespaced ID"
              value={draft.id}
              error={fieldErrors.get('id')}
              mono
              onChange={(value) => {
                idEdited.current = true;
                update('id', value.toLocaleLowerCase().replace(/\s+/g, '-'));
              }}
            />
            <ModuleTextField label="Author" value={draft.author} error={fieldErrors.get('author')} onChange={(value) => update('author', value)} />
            <ModuleTextField label="Manufacturer" value={draft.manufacturer} error={fieldErrors.get('manufacturer')} onChange={(value) => update('manufacturer', value)} />
            <ModuleTextField label="Model" value={draft.model} error={fieldErrors.get('model')} onChange={(value) => update('model', value)} />
            <div className="module-field-pair">
              <ModuleTextField label="VID" value={draft.vendorId} error={fieldErrors.get('vendorId')} mono maxLength={4} onChange={(value) => update('vendorId', cleanHex(value))} />
              <ModuleTextField label="PID" value={draft.productId} error={fieldErrors.get('productId')} mono maxLength={4} onChange={(value) => update('productId', cleanHex(value))} />
            </div>
            <ModuleTextField
              label="Description"
              value={draft.description}
              error={fieldErrors.get('description')}
              className="module-field--full"
              onChange={(value) => update('description', value)}
            />
          </div>

          <div className="module-workbench__footer">
            <div className="module-workbench__validation" aria-live="polite">
              {parsedDraft.success ? (
                <><ShieldCheck aria-hidden /> Ready to write the starter project files</>
              ) : (
                <><Blocks aria-hidden /> Complete the highlighted project fields</>
              )}
            </div>
            <Button type="submit" variant="primary" size="sm" disabled={!parsedDraft.success || pendingAction !== null} data-module-create className="no-drag">
              <Blocks aria-hidden />
              {pendingAction === 'create' ? 'Creating…' : 'Create starter project…'}
            </Button>
          </div>
          {globalError && pendingAction === null ? <p className="module-workbench__error" role="alert">{globalError}</p> : null}
        </form>
      </div>

      <aside className="module-workbench__preview" aria-label="Generated package preview">
        <div className="module-preview__header">
          <span>Package preview</span>
          <strong>{parsedDraft.success ? 'Valid draft' : 'Incomplete'}</strong>
        </div>
        <pre tabIndex={0}>{JSON.stringify(manifestPreview, null, 2)}</pre>
        <dl className="module-boundaries">
          <div><dt>Runtime</dt><dd>Sandboxed Chromium</dd></div>
          <div><dt>Device access</dt><dd>Matching HID metadata</dd></div>
          <div><dt>Node · IPC · network</dt><dd>Blocked</dd></div>
          <div><dt>Writable controls</dt><dd>Core adapter review</dd></div>
        </dl>
      </aside>
    </section>
  );
}

function ModuleTextField({
  label,
  value,
  error,
  mono,
  maxLength,
  className,
  onChange,
}: {
  label: string;
  value: string;
  error?: string;
  mono?: boolean;
  maxLength?: number;
  className?: string;
  onChange: (value: string) => void;
}) {
  const id = `module-field-${label.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <label className={`module-field ${className ?? ''}`} htmlFor={id}>
      <span>{label}</span>
      <Input
        id={id}
        value={value}
        maxLength={maxLength}
        aria-invalid={Boolean(error)}
        title={error}
        onChange={(event) => onChange(event.target.value)}
        className={mono ? 'module-field__mono' : undefined}
      />
    </label>
  );
}

function ModuleSelectField({
  label,
  value,
  options,
  className,
  onValueChange,
}: {
  label: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  className?: string;
  onValueChange: (value: string) => void;
}) {
  const id = `module-field-${label.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <label className={`module-field ${className ?? ''}`}>
      <span id={id}>{label}</span>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger aria-labelledby={id}><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </label>
  );
}

function createInitialDraft(devices: Device[]): Draft {
  const device = devices.find(hasUsbIdentity);
  return device ? draftFromDevice(device) : {
    id: '',
    name: '',
    description: '',
    author: '',
    manufacturer: '',
    model: '',
    deviceKind: 'unknown',
    vendorId: '',
    productId: '',
  };
}

function draftFromDevice(device: Device): Draft {
  const name = `${device.displayName} Support`;
  return {
    id: suggestedModuleId(name),
    name,
    description: `Adds identity and discovery support for ${device.displayName}.`,
    author: '',
    manufacturer: device.identity.manufacturer ?? 'Unknown manufacturer',
    model: device.identity.model ?? device.displayName,
    deviceKind: device.kind,
    vendorId: hex(device.identity.vendorId!),
    productId: hex(device.identity.productId!),
  };
}

function initialSourceDeviceId(devices: Device[]): string {
  return devices.find(hasUsbIdentity)?.id ?? 'manual';
}

function hasUsbIdentity(device: Device): boolean {
  return typeof device.identity.vendorId === 'number' && typeof device.identity.productId === 'number';
}

function suggestedModuleId(name: string): string {
  const slug = name.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return slug ? `device.local.${slug}` : '';
}

function cleanHex(value: string): string {
  return value.replace(/^0x/i, '').replace(/[^0-9a-f]/gi, '').slice(0, 4).toLocaleLowerCase();
}

function hex(value: number): string {
  return value.toString(16).padStart(4, '0');
}

function previewManifest(draft: Draft, version: string) {
  return {
    schemaVersion: 1,
    id: draft.id || 'device.your-name.product',
    version: '0.1.0',
    minimumCoreVersion: version.match(/^\d+\.\d+\.\d+/)?.[0] ?? '0.1.0',
    kind: 'device',
    entrypoint: 'src/index.js',
    capabilities: ['device-discovery'],
    permissions: {
      hid: [{
        vendorId: draft.vendorId || '0000',
        productIds: [draft.productId || '0000'],
      }],
    },
  };
}
