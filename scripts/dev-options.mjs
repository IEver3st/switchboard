export function getDevLaunchOptions(cliArguments, sourceEnvironment) {
  const demoUpdate = cliArguments.includes('--demo-update');
  const forwardedArguments = cliArguments.filter((argument) => argument !== '--demo-update');
  const environment = { ...sourceEnvironment };
  delete environment.ELECTRON_RUN_AS_NODE;

  if (demoUpdate) environment.SWITCHBOARD_DEMO_UPDATE = '1';

  return { environment, forwardedArguments };
}
