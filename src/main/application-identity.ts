import { join } from 'node:path';

export const installedApplicationId = 'dev.switchboard.prototype';
export const developmentApplicationId = 'dev.switchboard.prototype.dev';

export type ApplicationIdentity = {
  appUserModelId: string;
  displayName: string;
  userDataPath: string | null;
};

export function shouldApplyDevelopmentIdentity(input: {
  isNativeReview: boolean;
  isPackaged: boolean;
}): boolean {
  return !input.isPackaged && !input.isNativeReview;
}

export function resolveApplicationIdentity(input: {
  appDataPath: string;
  isPackaged: boolean;
}): ApplicationIdentity {
  if (input.isPackaged) {
    return {
      appUserModelId: installedApplicationId,
      displayName: 'Switchboard',
      userDataPath: null,
    };
  }

  return {
    appUserModelId: developmentApplicationId,
    displayName: 'Switchboard Dev',
    userDataPath: join(input.appDataPath, 'Switchboard Dev'),
  };
}
