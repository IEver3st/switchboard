import type { SystemSnapshot } from '../shared/contracts';

type StartupSnapshotController = {
  prepareSnapshot(): Promise<void>;
  getSnapshot(): SystemSnapshot;
};

export async function getStartupSnapshot(controller: StartupSnapshotController): Promise<SystemSnapshot> {
  await controller.prepareSnapshot();
  return controller.getSnapshot();
}
