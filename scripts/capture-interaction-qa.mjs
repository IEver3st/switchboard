import WebSocket from 'ws';

class CdpClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.sequence = 0;
    this.pending = new Map();
  }

  async connect() {
    await new Promise((resolvePromise, reject) => {
      this.socket.once('open', resolvePromise);
      this.socket.once('error', reject);
    });
    this.socket.on('message', (raw) => {
      const message = JSON.parse(raw.toString());
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result ?? {});
    });
  }

  send(method, params = {}) {
    const id = ++this.sequence;
    return new Promise((resolvePromise, reject) => {
      this.pending.set(id, { resolve: resolvePromise, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async close() {
    if (this.socket.readyState === WebSocket.CLOSED) return;
    await new Promise((resolvePromise) => {
      this.socket.once('close', resolvePromise);
      this.socket.close();
    });
  }
}

const port = Number(process.argv[2] ?? 9223);
const targets = await (await fetch('http://127.0.0.1:' + port + '/json')).json();
const target = targets.find((candidate) => candidate.type === 'page' && candidate.title === 'Switchboard')
  ?? targets.find((candidate) => candidate.type === 'page');
if (!target?.webSocketDebuggerUrl) throw new Error('Switchboard renderer target was not found.');

const client = new CdpClient(target.webSocketDebuggerUrl);
await client.connect();
await client.send('Page.enable');
await client.send('Runtime.enable');
await client.send('Emulation.setDeviceMetricsOverride', { width: 1420, height: 900, deviceScaleFactor: 1, mobile: false });
await evaluate("location.hash = 'capture'");
await waitFor("document.querySelectorAll('.capture-clip-card').length > 0");

const results = {};
const initial = await evaluate("(() => { const favorite = document.querySelector('button[data-favorite]'); const open = document.querySelector('button[aria-label^=\\\"Open \\\"]'); return { name: open?.getAttribute('aria-label')?.replace(/^Open /, ''), favorite: favorite?.getAttribute('aria-pressed'), count: document.querySelectorAll('.capture-clip-card').length }; })()");
if (!initial.name || initial.favorite !== 'false') throw new Error('Expected an unfavorited clip for the reversible interaction test.');

await click("document.querySelector('button[data-favorite]')");
await waitFor("document.querySelector('button[data-favorite]')?.getAttribute('aria-pressed') === 'true'");
await reload();
results.favoritePersistence = await evaluate("document.querySelector('button[data-favorite]')?.getAttribute('aria-pressed') === 'true'");
await clickButton('Favorites');
await waitFor("document.querySelectorAll('.capture-clip-card').length === 1");
results.favoriteFilter = true;
await clickButton('Favorites');
await waitFor("document.querySelectorAll('.capture-clip-card').length === " + initial.count);
await click("document.querySelector('button[data-favorite]')");
await waitFor("document.querySelector('button[data-favorite]')?.getAttribute('aria-pressed') === 'false'");
await reload();
results.favoriteRestored = await evaluate("document.querySelector('button[data-favorite]')?.getAttribute('aria-pressed') === 'false'");

await setInput('input[placeholder="Search clips"]', 'Desktop');
await waitFor("document.querySelectorAll('.capture-clip-card').length === " + initial.count);
results.searchMatch = initial.count;
await setInput('input[placeholder="Search clips"]', 'definitely-no-such-clip');
await waitFor("document.body.textContent.includes('No clips found')");
results.searchEmpty = await evaluate("document.body.textContent.includes('Try another search or filter.')");
await setInput('input[placeholder="Search clips"]', '');
await waitFor("document.querySelectorAll('.capture-clip-card').length === " + initial.count);

await click("document.querySelector('button[aria-label=\\\"Filter clips by game\\\"]')");
await waitFor("document.querySelectorAll('[role=option]').length > 0");
results.gameOptions = await evaluate("[...document.querySelectorAll('[role=option]')].map((node) => node.textContent.trim())");
await clickOption('Desktop');
await waitFor("document.querySelectorAll('.capture-clip-card').length === " + initial.count);
results.gameFilter = true;
await click("document.querySelector('button[aria-label=\\\"Filter clips by game\\\"]')");
await waitFor("document.querySelectorAll('[role=option]').length > 0");
await clickOption('All games');

const newestFirst = await firstThumbnailId();
await click("document.querySelector('button[aria-label=\\\"Sort clips\\\"]')");
await waitFor("document.querySelectorAll('[role=option]').length > 0");
results.sortOptions = await evaluate("[...document.querySelectorAll('[role=option]')].map((node) => node.textContent.trim())");
await clickOption('Oldest');
await waitFor("document.querySelector('button[aria-label=\\\"Sort clips\\\"]')?.textContent?.includes('Oldest')");
results.sortChangedOrder = newestFirst !== await firstThumbnailId();
await click("document.querySelector('button[aria-label=\\\"Sort clips\\\"]')");
await waitFor("document.querySelectorAll('[role=option]').length > 0");
await clickOption('Newest');

await clickButton('Filter');
await waitFor("[...document.querySelectorAll('button')].some((button) => button.textContent.trim() === 'Today')");
results.dateOptions = await evaluate("[...document.querySelectorAll('button')].map((button) => button.textContent.trim()).filter((text) => ['Any date','Today','Yesterday','Last 7 days','Last 30 days'].includes(text))");
await clickButton('Today');
await waitFor("document.querySelector('.capture-tool-control--date')?.textContent.includes('Filter · 1')");
await click("document.querySelector('.capture-tool-control--date')");
await waitFor("[...document.querySelectorAll('button')].some((button) => button.textContent.trim() === 'Any date')");
await clickButton('Any date');

await click("document.querySelector('button[aria-label=\\\"List view\\\"]')");
await waitFor("document.querySelectorAll('tbody tr').length === " + initial.count);
results.listView = await evaluate("({ rows: document.querySelectorAll('tbody tr').length, headings: [...document.querySelectorAll('thead th')].map((node) => node.textContent.trim()).filter(Boolean) })");
await click("document.querySelector('button[aria-label=\\\"Grid view\\\"]')");
await waitFor("document.querySelectorAll('.capture-clip-card').length === " + initial.count);

await openFirstAction('Rename');
await waitFor("document.querySelector('#rename-clip-title')");
await setInput('[role=dialog] input', initial.name + ' QA');
await evaluate("document.querySelector('[role=dialog] form').requestSubmit()");
await waitFor("document.querySelector('#clip-editor-title') === null && document.body.textContent.includes(" + JSON.stringify(initial.name + ' QA') + ")");
await reload();
results.renamePersistence = await evaluate("document.body.textContent.includes(" + JSON.stringify(initial.name + ' QA') + ")");
await openFirstAction('Rename');
await waitFor("document.querySelector('#rename-clip-title')");
await setInput('[role=dialog] input', initial.name);
await evaluate("document.querySelector('[role=dialog] form').requestSubmit()");
await waitFor("!document.querySelector('#rename-clip-title')");
await reload();
results.renameRestored = await evaluate("document.body.textContent.includes(" + JSON.stringify(initial.name) + ") && !document.body.textContent.includes(" + JSON.stringify(initial.name + ' QA') + ")");

await openFirstAction('Delete');
await waitFor("document.querySelector('#delete-clip-title')");
results.deleteConfirmation = await evaluate("document.querySelector('[role=dialog]')?.textContent?.includes('Recycle Bin')");
await clickButton('Cancel');
await waitFor("!document.querySelector('#delete-clip-title')");

await click("document.querySelector('button[aria-label^=\\\"Open \\\"]')");
await waitFor("document.querySelector('#clip-editor-title')");
results.editor = await evaluate("({ title: document.querySelector('#clip-editor-title')?.textContent, video: document.querySelector('video')?.getAttribute('src'), favorite: document.querySelector('header button[aria-pressed]')?.getAttribute('aria-pressed') })");
results.editorContainment = await evaluate("(() => { const root = document.querySelector('[data-testid=\"capture-library\"]'); const library = root?.firstElementChild; const editor = document.querySelector('[data-testid=\"clip-editor\"]'); return { libraryInert: library?.inert === true, libraryHidden: library?.getAttribute('aria-hidden') === 'true', modal: editor?.getAttribute('aria-modal') === 'true' }; })()");
await clickButton('Rename');
await waitFor("document.querySelector('#rename-clip-title')");
results.renameDialogFocus = await evaluate("document.activeElement?.tagName === 'INPUT'");
results.dialogContainment = await evaluate("document.querySelector('[data-testid=\"clip-editor\"]')?.parentElement?.inert === true");
await evaluate("document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))");
await waitFor("!document.querySelector('#rename-clip-title')");
results.renameDialogEscape = await evaluate("document.querySelector('[data-testid=\"clip-editor\"]')?.contains(document.activeElement)");
results.editorTabLoop = await evaluate("(() => { const editor = document.querySelector('[data-testid=\"clip-editor\"]'); const controls = [...editor.querySelectorAll('a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), video[controls], [tabindex]:not([tabindex=\"-1\"])')].filter((element) => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true'); controls.at(-1)?.focus(); controls.at(-1)?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })); return document.activeElement === controls[0]; })()");
await clickButton('Back to clips');
await waitFor("!document.querySelector('#clip-editor-title')");

await click("document.querySelector('.capture-replay-summary')");
await waitFor("document.querySelector('button[aria-label=Encoder]')");
await click("document.querySelector('.capture-replay-advanced > summary')");
results.replayConfiguration = await evaluate("['Replay length','Capture quality','Capture resolution','Capture frame rate','Encoder','Codec','Game audio','Microphone','Capture cursor'].every((label) => document.querySelector('[aria-label=\\\"' + label + '\\\"]')) && Boolean(document.querySelector('button[aria-label^=\\\"Capture source:\\\"]')) && Boolean(document.querySelector('[aria-label^=\\\"Save replay shortcut:\\\"]'))");
results.audioCapabilityTruth = await evaluate("(() => { const game = document.querySelector('[aria-label=\"Game audio\"]'); const microphone = document.querySelector('[aria-label=\"Microphone\"]'); return { gameDisabled: game?.disabled === true, microphoneDisabled: microphone?.disabled === true, reasons: [...document.querySelectorAll('[data-radix-popper-content-wrapper] span')].filter((node) => node.textContent === 'Unavailable for this capture setup').length }; })()");
await evaluate("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");

const replaySwitch = "document.querySelector('[role=switch][aria-label=\\\"Instant Replay\\\"]')";
const replayInitiallyOn = await evaluate(replaySwitch + "?.getAttribute('aria-checked') === 'true'");
if (replayInitiallyOn) {
  await click(replaySwitch);
  await waitFor(replaySwitch + "?.getAttribute('aria-checked') === 'false'");
  results.replayOff = await evaluate("document.body.textContent.includes('Replay is off')");
  await clickButton('Turn on Replay');
  try {
    await waitFor(replaySwitch + "?.getAttribute('aria-checked') === 'true'", 20_000);
    results.replayRestored = true;
  } catch {
    results.replayRestoreBlocked = 'Capture host did not respond while another native review instance was active.';
  }
} else {
  results.replayOff = true;
  const turnOnVisible = await evaluate("[...document.querySelectorAll('button')].some((button) => button.textContent.trim() === 'Turn on Replay')");
  results.replayPrimaryAction = turnOnVisible;
}

await evaluate("document.querySelector('input[placeholder=\\\"Search clips\\\"]')?.focus()");
results.focusTarget = await evaluate("document.activeElement?.getAttribute('placeholder')");
results.horizontalOverflow = await evaluate("document.documentElement.scrollWidth === document.documentElement.clientWidth");

await client.send('Emulation.clearDeviceMetricsOverride');
await client.close();
process.stdout.write(JSON.stringify(results, null, 2) + '\n');

async function reload() {
  await client.send('Page.reload', { ignoreCache: true });
  await waitFor("location.hash === '#capture' && document.querySelectorAll('.capture-clip-card').length > 0", 12_000);
}

async function firstThumbnailId() {
  return evaluate("document.querySelector('.capture-clip-card img')?.getAttribute('src')");
}

async function openFirstAction(label) {
  await click("document.querySelector('button[aria-label^=\\\"Actions for \\\"]')");
  await waitFor("[...document.querySelectorAll('button')].some((button) => button.textContent.trim() === " + JSON.stringify(label) + ")");
  await clickButton(label);
}

async function click(expression) {
  const clicked = await evaluate("(() => { const node = " + expression + "; if (!node) return false; node.click(); return true; })()");
  if (!clicked) throw new Error('Could not click: ' + expression);
}

async function clickButton(text) {
  const clicked = await evaluate("(() => { const node = [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === " + JSON.stringify(text) + "); if (!node) return false; node.click(); return true; })()");
  if (!clicked) throw new Error('Button was not found: ' + text);
}

async function clickOption(text) {
  const clicked = await evaluate("(() => { const node = [...document.querySelectorAll('[role=option]')].find((option) => option.textContent.trim() === " + JSON.stringify(text) + "); if (!node) return false; node.click(); return true; })()");
  if (!clicked) throw new Error('Option was not found: ' + text);
}

async function setInput(selector, value) {
  const expression = "(() => { const input = document.querySelector(" + JSON.stringify(selector) + "); if (!input) return false; const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(input, " + JSON.stringify(value) + "); input.dispatchEvent(new Event('input', { bubbles: true })); return true; })()";
  if (!await evaluate(expression)) throw new Error('Input was not found: ' + selector);
}

async function waitFor(condition, timeout = 8_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate('Boolean(' + condition + ')')) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 80));
  }
  throw new Error('Timed out waiting for: ' + condition);
}

async function evaluate(expression) {
  const result = await client.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? 'Renderer evaluation failed.');
  return result.result?.value;
}
