import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import {
  developmentApplicationId,
  installedApplicationId,
  resolveApplicationIdentity,
  shouldApplyDevelopmentIdentity,
} from '../src/main/application-identity';

describe('application identity', () => {
  it('keeps the installed identity and existing user data location stable', () => {
    expect(resolveApplicationIdentity({
      appDataPath: 'C:\\Users\\Tester\\AppData\\Roaming',
      isPackaged: true,
    })).toEqual({
      appUserModelId: installedApplicationId,
      displayName: 'Switchboard',
      userDataPath: null,
    });
  });

  it('isolates development state and Windows identity from the installed app', () => {
    const appDataPath = 'C:\\Users\\Tester\\AppData\\Roaming';
    const development = resolveApplicationIdentity({ appDataPath, isPackaged: false });
    const installed = resolveApplicationIdentity({ appDataPath, isPackaged: true });

    expect(development).toEqual({
      appUserModelId: developmentApplicationId,
      displayName: 'Switchboard Dev',
      userDataPath: join(appDataPath, 'Switchboard Dev'),
    });
    expect(development.appUserModelId).not.toBe(installed.appUserModelId);
    expect(development.userDataPath).not.toBe(installed.userDataPath);
  });

  it('preserves a native review harness temporary profile', () => {
    expect(shouldApplyDevelopmentIdentity({ isPackaged: false, isNativeReview: false })).toBeTrue();
    expect(shouldApplyDevelopmentIdentity({ isPackaged: false, isNativeReview: true })).toBeFalse();
    expect(shouldApplyDevelopmentIdentity({ isPackaged: true, isNativeReview: false })).toBeFalse();
  });
});
