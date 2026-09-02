import { createHash } from 'node:crypto';

export function addonPartitionName(moduleId: string): string {
  const stableId = createHash('sha256').update(moduleId).digest('hex').slice(0, 24);
  return `switchboard-addon-${stableId}`;
}
