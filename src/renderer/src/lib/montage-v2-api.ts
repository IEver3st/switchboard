import type { MontageProjectV2, MontageV2Api } from '../../../shared/montage-v2';

const runtimeApi = window.switchboard as (typeof window.switchboard & Partial<MontageV2Api>) | undefined;
let demoDrafts: MontageProjectV2[] = [];

const demoApi: MontageV2Api = {
  async importMontageAudio() {
    throw new Error('Music import is available only in the Switchboard desktop application.');
  },
  async loadMontageAudioWaveform(assetId) {
    return { assetId, samples: [] };
  },
  async listMontageDrafts() {
    return structuredClone(demoDrafts);
  },
  async saveMontageDraft(project) {
    const saved = structuredClone({ ...project, updatedAt: Date.now() });
    demoDrafts = [saved, ...demoDrafts.filter((candidate) => candidate.id !== saved.id)].slice(0, 20);
    return structuredClone(saved);
  },
  async deleteMontageDraft(projectId) {
    demoDrafts = demoDrafts.filter((candidate) => candidate.id !== projectId);
  },
  async exportMontageV2() {
    throw new Error('Montage export is available only in the Switchboard desktop application.');
  },
  async cancelMontageV2Export() {},
};

export const montageV2Api: MontageV2Api = runtimeApi
  && typeof runtimeApi.importMontageAudio === 'function'
  && typeof runtimeApi.exportMontageV2 === 'function'
  ? runtimeApi as typeof runtimeApi & MontageV2Api
  : demoApi;
