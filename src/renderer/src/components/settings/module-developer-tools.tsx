import { ArrowLeft, Code2 } from 'lucide-react';
import type { SystemSnapshot } from '../../../../shared/contracts';
import { ModuleAuthoringWorkbench } from '@/components/settings/module-authoring-workbench';
import { LocalModuleProjects } from '@/components/settings/module-management';
import { Button } from '@/components/ui/button';

export function ModuleDeveloperTools({
  snapshot,
  onBack,
}: {
  snapshot: SystemSnapshot;
  onBack: () => void;
}) {
  return (
    <div className="module-developer-tools">
      <Button type="button" variant="ghost" size="sm" onClick={onBack} className="module-developer-tools__back">
        <ArrowLeft aria-hidden />
        Back to Modules
      </Button>

      <header className="module-developer-tools__header">
        <Code2 aria-hidden />
        <div>
          <h2>Developer tools</h2>
          <p>Build, inspect, and test sandboxed Switchboard modules.</p>
        </div>
      </header>

      <LocalModuleProjects snapshot={snapshot} />
      <ModuleAuthoringWorkbench snapshot={snapshot} />
    </div>
  );
}
