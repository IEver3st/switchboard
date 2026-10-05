const state = {
  page: 'devices',
  capture: false,
  memory: 136,
  cpu: 0.3,
  buffered: 0,
  selectedDevice: 'mouse',
  modules: [
    { name: 'HyperX QuadCast', description: 'QuadCast, QuadCast S, and QuadCast 2 controls through one capability module.', kind: 'device', size: '1.2 MB', enabled: true },
    { name: 'Logitech HID++', description: 'Self-describing Logitech mouse and keyboard support without one package per model.', kind: 'device', size: '1.8 MB', enabled: true },
    { name: 'Instant Replay', description: 'Isolated capture process with a disk-backed rolling buffer and hardware encoder selection.', kind: 'capture', size: '84 MB', enabled: false },
  ]
};

const pages = [
  ['devices', '⌁', 'Devices'],
  ['capture', '●', 'Capture'],
];
const copy = {
  devices: ['Devices', 'Connected hardware and its most important controls.'],
  capture: ['Capture', 'A disk-backed replay buffer in its own process.'],
  settings: ['Settings', 'Lifecycle, modules, diagnostics, and performance budgets.'],
};

const nav = document.querySelector('#navigation');
const content = document.querySelector('#page-content');
const toast = document.querySelector('#toast');

function renderNav() {
  nav.innerHTML = pages.map(([id, icon, label]) => `<button class="nav-button ${state.page === id ? 'active' : ''}" data-page="${id}"><span class="nav-icon">${icon}</span><span>${label}</span>${id === 'devices' ? '<small>2</small>' : ''}</button>`).join('');
  document.querySelector('.settings-link').classList.toggle('active', state.page === 'settings');
  document.querySelectorAll('[data-page]').forEach(button => button.onclick = () => { state.page = button.dataset.page; render(); });
}

function updateRuntime() {
  state.memory = 136 + (state.capture ? 31 : 0);
  state.cpu = .3 + (state.capture ? .8 : 0);
  document.querySelector('#total-memory').textContent = Math.round(state.memory);
  document.querySelector('#memory-total').textContent = `${Math.round(state.memory)} MB`;
  document.querySelector('#cpu-total').textContent = `${state.cpu.toFixed(1)}% CPU`;
  document.querySelector('#memory-progress').style.width = `${Math.min(100, state.memory / 240 * 100)}%`;
  document.querySelector('#capture-dot').classList.toggle('running', state.capture);
  document.querySelector('#capture-memory').textContent = state.capture ? '31 MB' : 'off';
  const replayModule = state.modules.find(m => m.name === 'Instant Replay');
  replayModule.enabled = state.capture;
}

function render() {
  updateRuntime();
  renderNav();
  document.querySelector('#page-title').textContent = copy[state.page][0];
  document.querySelector('#page-description').textContent = copy[state.page][1];
  content.innerHTML = ({
    devices: renderDevices,
    capture: renderCapture,
    settings: renderSettings,
  })[state.page]();
  wirePage();
}

function renderCapture() {
  const filled = Math.ceil((state.buffered / 60) * 30);
  return `<div class="page-stack"><section class="surface header-surface"><div class="header-left"><div class="header-icon ${state.capture ? 'active' : ''}">●</div><div><div class="eyebrow"><span class="live" style="background:${state.capture ? 'var(--success)' : '#4e5560'}"></span>${state.capture ? 'Replay buffer active' : 'Capture host stopped'}</div><h2>Instant Replay</h2><p>Compressed segments live on disk. Saving a clip does not re-encode.</p></div></div><div class="header-actions"><div class="runtime-stat"><small>Buffered</small><b>${state.buffered}s</b></div><div class="runtime-stat"><small>Disk ring</small><b>${Math.round(state.buffered*3.75)} MB</b></div><div class="runtime-stat"><small>Encoder</small><b>NVENC AV1</b></div><button class="switch ${state.capture ? 'on' : ''}" data-toggle="capture"><i></i></button><button class="button primary" id="save-replay" ${state.capture ? '' : 'disabled'}>Save replay</button></div></section><div class="capture-grid"><section class="surface panel"><div class="section-title"><div class="eyebrow">Capture</div><h3>Quality and source</h3><p>The prototype models the FFmpeg-backed engine contract and isolated process lifecycle.</p></div><div class="config-grid"><div class="config-row"><div class="symbol">▣</div><div class="copy"><b>Source</b><small>Automatic game window</small></div><select><option>Automatic game</option><option>Display</option><option>Window</option></select></div><div class="config-row"><div class="symbol">▤</div><div class="copy"><b>Resolution</b><small>Output canvas</small></div><select><option>1440p</option><option>1080p</option><option>Native</option></select></div><div class="config-row"><div class="symbol">⌁</div><div class="copy"><b>Frame rate</b><small>Stable output target</small></div><select><option>60 FPS</option><option>120 FPS</option><option>30 FPS</option></select></div><div class="config-row"><div class="symbol">▰</div><div class="copy"><b>Codec</b><small>Hardware encoder preferred</small></div><select><option>AV1 · Auto</option><option>H.264 · NVENC</option></select></div></div><div style="margin-top:24px;border-top:1px solid var(--border);padding-top:20px"><div style="display:flex;align-items:end;justify-content:space-between"><div><b style="font-size:11px;color:#89919c">Replay duration</b><small style="display:block;margin-top:5px;color:#616a75">Disk usage scales with encoded bitrate.</small></div><div class="big-number">60 <small style="font-size:10px;color:#626b76">seconds</small></div></div><div class="slider-line"><i style="left:16%"></i></div></div></section><section class="surface panel"><div class="section-title"><div class="eyebrow">Rolling buffer</div><h3>Segment ring</h3><p>Two-second segments are overwritten in place.</p></div><div class="ring"><div class="ring-head"><span>${Math.ceil(state.buffered/2)} segments</span><b>${Math.round(state.buffered/60*100)}% ready</b></div><div class="segments">${Array.from({length:30},(_,i)=>`<i class="${i<filled?'filled':''}"></i>`).join('')}</div></div><div class="summary-grid" style="grid-template-columns:repeat(2,1fr);margin-top:12px"><div class="route"><span>◷</span><div class="copy"><small>Target</small><b>60s</b></div></div><div class="route"><span>▰</span><div class="copy"><small>Estimated</small><b>${Math.round(state.buffered*3.75)} MB</b></div></div></div></section></div><div class="capture-grid"><section class="surface panel"><div class="section-title"><div class="eyebrow">Tracks</div><h3>Audio and pointer</h3><p>The audio engine can provide a dedicated clip mix.</p></div><div class="settings-list"><div class="setting-row"><span>◉</span><div class="copy"><b>Microphone track</b><small>Your microphone on its own track.</small></div><button class="switch on"><i></i></button></div><div class="setting-row"><span>≋</span><div class="copy"><b>Chat track</b><small>Keep voice chat separate from game audio.</small></div><button class="switch on"><i></i></button></div><div class="setting-row"><span>⌁</span><div class="copy"><b>Capture cursor</b><small>Include the hardware pointer in clips.</small></div><button class="switch"><i></i></button></div></div></section><section class="surface panel"><div class="section-title"><div class="eyebrow">Recent</div><h3>Clips</h3><p>Prototype saves write a metadata artifact.</p></div><div class="route-list"><div class="route"><span>▣</span><div class="copy"><b>War Thunder · clean pass</b><small>45 seconds · 126 MB · 42m ago</small></div><span class="prototype-label">Prototype</span></div><div class="route"><span>▣</span><div class="copy"><b>FiveM · pursuit ending</b><small>60 seconds · 178 MB · 3h ago</small></div><span class="prototype-label">Prototype</span></div></div></section></div></div>`;
}

function renderModules() {
  return `<section class="surface module-table"><div class="section-title"><div class="eyebrow">Modules</div><h3>Installed modules</h3><p>Only enabled modules may claim devices or start an engine process.</p></div>${state.modules.map((m,i)=>`<div class="module-row ${m.enabled?'enabled':''}"><div class="module-icon">${m.kind==='device'?'⌁':m.kind==='audio'?'≋':'●'}</div><div class="copy"><b>${m.name}</b><small>${m.description}</small></div><div class="size">${m.size}</div><div class="kind">${m.kind}</div><button class="button" data-module="${i}">${m.enabled?'Disable':'Enable'}</button></div>`).join('')}</section>`;
}

function renderDevices() {
  const mouse = state.selectedDevice === 'mouse';
  return `<div class="device-workbench"><section class="surface device-list"><div class="device-list-head"><b>Connected hardware</b><small>2 devices · 2 modules</small></div><div class="device-choice ${mouse?'active':''}" data-device="mouse"><div class="device-icon">⌁</div><div><b>G502 X Plus</b><small>● wireless</small></div></div><div class="device-choice ${!mouse?'active':''}" data-device="mic"><div class="device-icon">◉</div><div><b>QuadCast 2</b><small>● USB</small></div></div></section><div class="device-detail"><section class="surface device-hero"><div class="device-icon">${mouse?'⌁':'◉'}</div><div><div class="eyebrow"><span class="live"></span>${mouse?'Logitech · wireless':'HyperX · USB'}</div><h2>${mouse?'G502 X Plus':'QuadCast 2'}</h2><div class="capabilities">${(mouse?['dpi','polling rate','buttons','battery','profiles']:['gain','monitoring','mute','lighting']).map(x=>`<span>${x}</span>`).join('')}</div></div></section><div class="device-controls"><section class="surface panel"><div class="section-title"><div class="eyebrow">${mouse?'Pointer':'Input'}</div><h3>${mouse?'Sensitivity':'Microphone level'}</h3><p>${mouse?'Stages are rendered by the shared mouse capability UI.':'Raw controls stay in the HyperX module; DSP belongs to Audio.Host.'}</p></div><div style="margin-top:24px;display:flex;justify-content:space-between;align-items:end"><span style="font-size:11px;color:#89919c">${mouse?'Active DPI':'Input gain'}</span><div class="big-number">${mouse?'1600':'58'} <small style="font-size:10px;color:#626b76">${mouse?'DPI':'%'}</small></div></div><div class="slider-line"><i style="left:${mouse?'32':'58'}%"></i></div>${mouse?'<div class="dpi-stages"><button>800</button><button class="active">1600</button><button>3200</button></div>':'<div class="route" style="margin-top:24px"><span>≋</span><div class="copy"><small>Live input meter</small><b>−8.4 dB</b></div><div class="progress" style="width:130px"><i style="width:68%"></i></div></div>'}</section><section class="surface panel"><div class="section-title"><div class="eyebrow">${mouse?'Sensor':'Hardware'}</div><h3>${mouse?'Report rate':'Status ring'}</h3><p>${mouse?'Written only when the value changes.':'Static state requires no separate RGB process.'}</p></div><div class="route-list"><div class="route"><span>${mouse?'⌁':'●'}</span><div class="copy"><small>${mouse?'Polling rate':'Lighting'}</small><b>${mouse?'1000 Hz':'Enabled · #ff4f7d'}</b></div><span>${mouse?'⌄':''}</span></div><div class="setting-row"><span>✓</span><div class="copy"><b>${mouse?'Onboard memory':'Mute LED follows state'}</b><small>${mouse?'Keep the profile on the mouse.':'Mirror tap-to-mute without polling.'}</small></div><button class="switch on"><i></i></button></div></div></section></div></div></div>`;
}

function renderSettings() {
  return `<div class="page-stack"><div class="settings-grid"><section class="surface panel"><div class="section-title"><div class="eyebrow">Lifecycle</div><h3>Background behavior</h3><p>The renderer can be destroyed in tray mode while device and engine hosts continue independently.</p></div><div class="settings-list"><div class="setting-row"><span class="symbol">◷</span><div class="copy"><b>Launch at startup</b><small>Start the core only. Optional engines remain off until required.</small></div><button class="switch"><i></i></button></div><div class="setting-row"><span class="symbol">▰</span><div class="copy"><b>Close to tray</b><small>Keep hotkeys and connected device profiles available.</small></div><button class="switch on"><i></i></button></div><div class="setting-row"><span class="symbol">×</span><div class="copy"><b>Destroy renderer in tray</b><small>Release the Chromium page instead of merely hiding it.</small></div><button class="switch on"><i></i></button></div><div class="setting-row"><span class="symbol">↻</span><div class="copy"><b>Automatic module updates</b><small>Verify signatures, install atomically, retain a rollback.</small></div><button class="switch on"><i></i></button></div></div></section><section class="surface panel"><div class="section-title"><div class="eyebrow">Guardrails</div><h3>Performance budget</h3><p>A regression should fail release validation instead of becoming normal.</p></div><div style="margin-top:22px"><div class="ring-head"><span>Memory</span><b>${Math.round(state.memory)} / 240 MB</b></div><div class="progress" style="height:6px;margin-top:10px"><i style="width:${Math.min(100,state.memory/240*100)}%"></i></div><div class="ring-head" style="margin-top:22px"><span>Idle CPU</span><b>${state.cpu.toFixed(1)} / 2.0%</b></div><div class="progress" style="height:6px;margin-top:10px"><i style="width:${Math.min(100,state.cpu/2*100)}%"></i></div></div><div class="summary-grid" style="margin-top:22px"><div class="route"><div class="copy"><small>Core</small><b>44 MB</b></div></div><div class="route"><div class="copy"><small>Renderer</small><b>92 MB</b></div></div><div class="route"><div class="copy"><small>Processes</small><b>${2+(state.audio?1:0)+(state.capture?1:0)}</b></div></div></div></section></div>${renderModules()}</div>`;
}

function wirePage() {
  document.querySelectorAll('[data-go]').forEach(button => button.onclick = () => { state.page = button.dataset.go; render(); });
  document.querySelectorAll('[data-toggle]').forEach(button => button.onclick = () => {
    const kind = button.dataset.toggle;
    state[kind] = !state[kind];
    showToast(`Capture host ${state[kind] ? 'started' : 'stopped'}`);
    render();
  });
  document.querySelectorAll('[data-device]').forEach(button => button.onclick = () => { state.selectedDevice = button.dataset.device; state.page = 'devices'; render(); });
  document.querySelectorAll('[data-module]').forEach(button => button.onclick = () => { const module = state.modules[Number(button.dataset.module)]; module.enabled = !module.enabled; if(module.kind==='capture') state.capture=module.enabled; showToast(`${module.name} ${module.enabled?'enabled':'disabled'}`); render(); });
  const save = document.querySelector('#save-replay');
  if (save) save.onclick = () => showToast('Prototype replay metadata saved');
  document.querySelectorAll('.switch:not([data-toggle])').forEach(button => button.onclick = () => { button.classList.toggle('on'); showToast('Setting updated'); });
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 1400);
}

setInterval(() => {
  if (!state.capture) return;
  state.buffered = Math.min(60, state.buffered + 1);
  if (state.page === 'capture') render();
  else updateRuntime();
}, 1000);

render();
