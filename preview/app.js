const state = {
  page: 'devices',
  audio: false,
  capture: false,
  memory: 136,
  cpu: 0.3,
  buffered: 0,
  selectedDevice: 'mouse',
  modules: [
    { name: 'HyperX QuadCast', description: 'QuadCast, QuadCast S, and QuadCast 2 controls through one capability module.', kind: 'device', size: '1.2 MB', enabled: true },
    { name: 'Logitech HID++', description: 'Self-describing Logitech mouse and keyboard support without one package per model.', kind: 'device', size: '1.8 MB', enabled: true },
    { name: 'Instant Replay', description: 'Isolated capture process with a disk-backed rolling buffer and hardware encoder selection.', kind: 'capture', size: '84 MB', enabled: false },
    { name: 'Audio Router', description: 'Game, chat, media, and aux buses with independent personal, stream, and clip mixes.', kind: 'audio', size: '11.6 MB', enabled: false },
  ]
};

const pages = [
  ['devices', '⌁', 'Devices'],
  ['audio', '≋', 'Audio'],
  ['capture', '●', 'Capture'],
  ['modules', '▦', 'Modules'],
];
const copy = {
  devices: ['Devices', 'Connected hardware and its most important controls.'],
  audio: ['Audio', 'Route, mix, and process audio without a monolithic suite.'],
  capture: ['Capture', 'A disk-backed replay buffer in its own process.'],
  modules: ['Modules', 'Install only the device families and engines you use.'],
  settings: ['Settings', 'Lifecycle, diagnostics, and performance budgets.'],
};

const nav = document.querySelector('#navigation');
const content = document.querySelector('#page-content');
const toast = document.querySelector('#toast');

function renderNav() {
  nav.innerHTML = pages.map(([id, icon, label]) => `<button class="nav-button ${state.page === id ? 'active' : ''}" data-page="${id}"><span class="nav-icon">${icon}</span><span>${label}</span>${id === 'devices' ? '<small>2</small>' : id === 'modules' ? `<small>${state.modules.filter(m => m.enabled).length}</small>` : ''}</button>`).join('');
  document.querySelector('.settings-link').classList.toggle('active', state.page === 'settings');
  document.querySelectorAll('[data-page]').forEach(button => button.onclick = () => { state.page = button.dataset.page; render(); });
}

function updateRuntime() {
  state.memory = 136 + (state.audio ? 24 : 0) + (state.capture ? 31 : 0);
  state.cpu = .3 + (state.audio ? .3 : 0) + (state.capture ? .8 : 0);
  document.querySelector('#total-memory').textContent = Math.round(state.memory);
  document.querySelector('#memory-total').textContent = `${Math.round(state.memory)} MB`;
  document.querySelector('#cpu-total').textContent = `${state.cpu.toFixed(1)}% CPU`;
  document.querySelector('#memory-progress').style.width = `${Math.min(100, state.memory / 240 * 100)}%`;
  document.querySelector('#audio-dot').classList.toggle('running', state.audio);
  document.querySelector('#capture-dot').classList.toggle('running', state.capture);
  document.querySelector('#audio-memory').textContent = state.audio ? '24 MB' : 'off';
  document.querySelector('#capture-memory').textContent = state.capture ? '31 MB' : 'off';
  const replayModule = state.modules.find(m => m.name === 'Instant Replay');
  const audioModule = state.modules.find(m => m.name === 'Audio Router');
  replayModule.enabled = state.capture;
  audioModule.enabled = state.audio;
}

function render() {
  updateRuntime();
  renderNav();
  document.querySelector('#page-title').textContent = copy[state.page][0];
  document.querySelector('#page-description').textContent = copy[state.page][1];
  content.innerHTML = ({
    devices: renderDevices,
    audio: renderAudio,
    capture: renderCapture,
    modules: renderModules,
    settings: renderSettings,
  })[state.page]();
  wirePage();
}

function renderAudio() {
  const buses = [['Game',72,67,'0 dB'],['Chat',38,54,'-2 dB'],['Media',21,31,'-8 dB'],['Aux',8,60,'-1 dB']];
  return `<div class="page-stack"><section class="surface header-surface"><div class="header-left"><div class="header-icon ${state.audio ? 'active' : ''}">≋</div><div><div class="eyebrow"><span class="live" style="background:${state.audio ? 'var(--success)' : '#4e5560'}"></span>${state.audio ? 'Audio host running' : 'Audio host stopped'}</div><h2>Audio Router</h2><p>One 48 kHz graph for personal, stream, and clip mixes.</p></div></div><div class="header-actions"><div class="runtime-stat"><small>Memory</small><b>${state.audio ? '24 MB' : '0 MB'}</b></div><div class="runtime-stat"><small>CPU</small><b>${state.audio ? '0.3%' : '0.0%'}</b></div><div class="runtime-stat"><small>Sample rate</small><b>48 kHz</b></div><button class="switch ${state.audio ? 'on' : ''}" data-toggle="audio"><i></i></button></div></section><div class="audio-grid"><section class="surface panel"><div class="section-title"><div class="eyebrow">Personal mix</div><h3>Application buses</h3><p>Applications target virtual endpoints. The engine produces one low-latency headphone mix.</p></div><div class="bus-grid">${buses.map(b => `<div class="bus"><strong>${b[0]}</strong><small>${b[0] === 'Aux' ? '0 apps' : '1 app'}</small><div class="fader-wrap"><div class="level-meter"><i style="height:${b[1]}%"></i></div><div class="fader"><i style="--value:${b[2]}%"></i></div></div><b>${b[3]}</b><small>Switchboard ${b[0]}</small></div>`).join('')}</div><div class="chatmix"><strong>ChatMix</strong><small>Game</small><div class="track"><i></i></div><small>Chat</small><b>+15</b></div></section><section class="surface panel"><div class="section-title"><div class="eyebrow">Output</div><h3>Routing</h3><p>The physical endpoint can change without moving applications.</p></div><div class="route-list"><div class="route"><span>◖</span><div class="copy"><small>Personal output</small><b>Arctis Nova Pro Wireless</b></div><span>⌄</span></div><div class="route"><span>◎</span><div class="copy"><small>Stream output</small><b>Switchboard Stream</b></div><span class="prototype-label">Virtual</span></div><div class="route"><span>⌁</span><div class="copy"><small>Clip mix</small><b>Game + Chat + Mic</b></div><span>3 buses</span></div></div></section></div><div class="audio-grid"><section class="surface panel"><div class="section-title"><div class="eyebrow">Microphone</div><h3>Processing chain</h3><p>Small, allocation-free processors. Disabled nodes are skipped entirely.</p></div><div class="processor-grid">${['Input gain','Noise gate','Noise suppression','Parametric EQ','Compressor','Limiter'].map(x => `<div class="processor"><i>✓</i><div><b>${x}</b><small>${x === 'Noise suppression' ? 'medium' : 'low'} cost</small></div></div>`).join('')}</div></section><section class="surface panel"><div class="section-title"><div class="eyebrow">Mix outputs</div><h3>Independent destinations</h3><p>Personal, stream, and clip outputs reuse the same graph.</p></div><div class="route-list"><div class="route"><span class="dot running"></span><div class="copy"><b>Personal</b><small>Game 100 · Chat 76 · Media 42</small></div></div><div class="route"><span class="dot running"></span><div class="copy"><b>Stream</b><small>Game 100 · Chat 100 · Mic 100</small></div></div><div class="route"><span class="dot running"></span><div class="copy"><b>Clip</b><small>Game 100 · Chat 55 · Mic 100</small></div></div></div></section></div></div>`;
}

function renderCapture() {
  const filled = Math.ceil((state.buffered / 60) * 30);
  return `<div class="page-stack"><section class="surface header-surface"><div class="header-left"><div class="header-icon ${state.capture ? 'active' : ''}">●</div><div><div class="eyebrow"><span class="live" style="background:${state.capture ? 'var(--success)' : '#4e5560'}"></span>${state.capture ? 'Replay buffer active' : 'Capture host stopped'}</div><h2>Instant Replay</h2><p>Compressed segments live on disk. Saving a clip does not re-encode.</p></div></div><div class="header-actions"><div class="runtime-stat"><small>Buffered</small><b>${state.buffered}s</b></div><div class="runtime-stat"><small>Disk ring</small><b>${Math.round(state.buffered*3.75)} MB</b></div><div class="runtime-stat"><small>Encoder</small><b>NVENC AV1</b></div><button class="switch ${state.capture ? 'on' : ''}" data-toggle="capture"><i></i></button><button class="button primary" id="save-replay" ${state.capture ? '' : 'disabled'}>Save replay</button></div></section><div class="capture-grid"><section class="surface panel"><div class="section-title"><div class="eyebrow">Capture</div><h3>Quality and source</h3><p>The prototype models the FFmpeg-backed engine contract and isolated process lifecycle.</p></div><div class="config-grid"><div class="config-row"><div class="symbol">▣</div><div class="copy"><b>Source</b><small>Automatic game window</small></div><select><option>Automatic game</option><option>Display</option><option>Window</option></select></div><div class="config-row"><div class="symbol">▤</div><div class="copy"><b>Resolution</b><small>Output canvas</small></div><select><option>1440p</option><option>1080p</option><option>Native</option></select></div><div class="config-row"><div class="symbol">⌁</div><div class="copy"><b>Frame rate</b><small>Stable output target</small></div><select><option>60 FPS</option><option>120 FPS</option><option>30 FPS</option></select></div><div class="config-row"><div class="symbol">▰</div><div class="copy"><b>Codec</b><small>Hardware encoder preferred</small></div><select><option>AV1 · Auto</option><option>H.264 · NVENC</option></select></div></div><div style="margin-top:24px;border-top:1px solid var(--border);padding-top:20px"><div style="display:flex;align-items:end;justify-content:space-between"><div><b style="font-size:11px;color:#89919c">Replay duration</b><small style="display:block;margin-top:5px;color:#616a75">Disk usage scales with encoded bitrate.</small></div><div class="big-number">60 <small style="font-size:10px;color:#626b76">seconds</small></div></div><div class="slider-line"><i style="left:16%"></i></div></div></section><section class="surface panel"><div class="section-title"><div class="eyebrow">Rolling buffer</div><h3>Segment ring</h3><p>Two-second segments are overwritten in place.</p></div><div class="ring"><div class="ring-head"><span>${Math.ceil(state.buffered/2)} segments</span><b>${Math.round(state.buffered/60*100)}% ready</b></div><div class="segments">${Array.from({length:30},(_,i)=>`<i class="${i<filled?'filled':''}"></i>`).join('')}</div></div><div class="summary-grid" style="grid-template-columns:repeat(2,1fr);margin-top:12px"><div class="route"><span>◷</span><div class="copy"><small>Target</small><b>60s</b></div></div><div class="route"><span>▰</span><div class="copy"><small>Estimated</small><b>${Math.round(state.buffered*3.75)} MB</b></div></div></div></section></div><div class="capture-grid"><section class="surface panel"><div class="section-title"><div class="eyebrow">Tracks</div><h3>Audio and pointer</h3><p>The audio engine can provide a dedicated clip mix.</p></div><div class="settings-list"><div class="setting-row"><span>◉</span><div class="copy"><b>Microphone track</b><small>Processed mic on its own track.</small></div><button class="switch on"><i></i></button></div><div class="setting-row"><span>≋</span><div class="copy"><b>Chat track</b><small>Keep voice chat separate from game audio.</small></div><button class="switch on"><i></i></button></div><div class="setting-row"><span>⌁</span><div class="copy"><b>Capture cursor</b><small>Include the hardware pointer in clips.</small></div><button class="switch"><i></i></button></div></div></section><section class="surface panel"><div class="section-title"><div class="eyebrow">Recent</div><h3>Clips</h3><p>Prototype saves write a metadata artifact.</p></div><div class="route-list"><div class="route"><span>▣</span><div class="copy"><b>War Thunder · clean pass</b><small>45 seconds · 126 MB · 42m ago</small></div><span class="prototype-label">Prototype</span></div><div class="route"><span>▣</span><div class="copy"><b>FiveM · pursuit ending</b><small>60 seconds · 178 MB · 3h ago</small></div><span class="prototype-label">Prototype</span></div></div></section></div></div>`;
}

function renderModules() {
  return `<div class="page-stack"><div class="summary-grid"><section class="surface summary-box"><div class="summary-icon">✓</div><div><small>Installed</small><strong>4</strong><span style="font-size:9px;color:#606975">${state.modules.filter(m=>m.enabled).length} enabled</span></div></section><section class="surface summary-box"><div class="summary-icon">▰</div><div><small>Module storage</small><strong>99 MB</strong><span style="font-size:9px;color:#606975">Capture engine is 84 MB</span></div></section><section class="surface summary-box"><div class="summary-icon">◇</div><div><small>Trust policy</small><strong>Official only</strong><span style="font-size:9px;color:#606975">Signed package manifests</span></div></section></div><section class="surface module-table"><div class="section-title"><div class="eyebrow">Local</div><h3>Installed modules</h3><p>Only enabled modules may claim devices or start an engine process.</p></div>${state.modules.map((m,i)=>`<div class="module-row ${m.enabled?'enabled':''}"><div class="module-icon">${m.kind==='device'?'⌁':m.kind==='audio'?'≋':'●'}</div><div class="copy"><b>${m.name}</b><small>${m.description}</small></div><div class="size">${m.size}</div><div class="kind">${m.kind}</div><button class="button" data-module="${i}">${m.enabled?'Disable':'Enable'}</button></div>`).join('')}</section></div>`;
}

function renderDevices() {
  const mouse = state.selectedDevice === 'mouse';
  return `<div class="device-workbench"><section class="surface device-list"><div class="device-list-head"><b>Connected hardware</b><small>2 devices · 2 modules</small></div><div class="device-choice ${mouse?'active':''}" data-device="mouse"><div class="device-icon">⌁</div><div><b>G502 X Plus</b><small>● wireless</small></div></div><div class="device-choice ${!mouse?'active':''}" data-device="mic"><div class="device-icon">◉</div><div><b>QuadCast 2</b><small>● USB</small></div></div></section><div class="device-detail"><section class="surface device-hero"><div class="device-icon">${mouse?'⌁':'◉'}</div><div><div class="eyebrow"><span class="live"></span>${mouse?'Logitech · wireless':'HyperX · USB'}</div><h2>${mouse?'G502 X Plus':'QuadCast 2'}</h2><div class="capabilities">${(mouse?['dpi','polling rate','buttons','battery','profiles']:['gain','monitoring','mute','lighting']).map(x=>`<span>${x}</span>`).join('')}</div></div></section><div class="device-controls"><section class="surface panel"><div class="section-title"><div class="eyebrow">${mouse?'Pointer':'Input'}</div><h3>${mouse?'Sensitivity':'Microphone level'}</h3><p>${mouse?'Stages are rendered by the shared mouse capability UI.':'Raw controls stay in the HyperX module; DSP belongs to Audio.Host.'}</p></div><div style="margin-top:24px;display:flex;justify-content:space-between;align-items:end"><span style="font-size:11px;color:#89919c">${mouse?'Active DPI':'Input gain'}</span><div class="big-number">${mouse?'1600':'58'} <small style="font-size:10px;color:#626b76">${mouse?'DPI':'%'}</small></div></div><div class="slider-line"><i style="left:${mouse?'32':'58'}%"></i></div>${mouse?'<div class="dpi-stages"><button>800</button><button class="active">1600</button><button>3200</button></div>':'<div class="route" style="margin-top:24px"><span>≋</span><div class="copy"><small>Live input meter</small><b>−8.4 dB</b></div><div class="progress" style="width:130px"><i style="width:68%"></i></div></div>'}</section><section class="surface panel"><div class="section-title"><div class="eyebrow">${mouse?'Sensor':'Hardware'}</div><h3>${mouse?'Report rate':'Status ring'}</h3><p>${mouse?'Written only when the value changes.':'Static state requires no separate RGB process.'}</p></div><div class="route-list"><div class="route"><span>${mouse?'⌁':'●'}</span><div class="copy"><small>${mouse?'Polling rate':'Lighting'}</small><b>${mouse?'1000 Hz':'Enabled · #ff4f7d'}</b></div><span>${mouse?'⌄':''}</span></div><div class="setting-row"><span>✓</span><div class="copy"><b>${mouse?'Onboard memory':'Mute LED follows state'}</b><small>${mouse?'Keep the profile on the mouse.':'Mirror tap-to-mute without polling.'}</small></div><button class="switch on"><i></i></button></div></div></section></div></div></div>`;
}

function renderSettings() {
  return `<div class="settings-grid"><section class="surface panel"><div class="section-title"><div class="eyebrow">Lifecycle</div><h3>Background behavior</h3><p>The renderer can be destroyed in tray mode while device and engine hosts continue independently.</p></div><div class="settings-list"><div class="setting-row"><span class="symbol">◷</span><div class="copy"><b>Launch at startup</b><small>Start the core only. Optional engines remain off until required.</small></div><button class="switch"><i></i></button></div><div class="setting-row"><span class="symbol">▰</span><div class="copy"><b>Close to tray</b><small>Keep hotkeys and connected device profiles available.</small></div><button class="switch on"><i></i></button></div><div class="setting-row"><span class="symbol">×</span><div class="copy"><b>Destroy renderer in tray</b><small>Release the Chromium page instead of merely hiding it.</small></div><button class="switch on"><i></i></button></div><div class="setting-row"><span class="symbol">↻</span><div class="copy"><b>Automatic module updates</b><small>Verify signatures, install atomically, retain a rollback.</small></div><button class="switch on"><i></i></button></div></div></section><section class="surface panel"><div class="section-title"><div class="eyebrow">Guardrails</div><h3>Performance budget</h3><p>A regression should fail release validation instead of becoming normal.</p></div><div style="margin-top:22px"><div class="ring-head"><span>Memory</span><b>${Math.round(state.memory)} / 240 MB</b></div><div class="progress" style="height:6px;margin-top:10px"><i style="width:${Math.min(100,state.memory/240*100)}%"></i></div><div class="ring-head" style="margin-top:22px"><span>Idle CPU</span><b>${state.cpu.toFixed(1)} / 2.0%</b></div><div class="progress" style="height:6px;margin-top:10px"><i style="width:${Math.min(100,state.cpu/2*100)}%"></i></div></div><div class="summary-grid" style="margin-top:22px"><div class="route"><div class="copy"><small>Core</small><b>44 MB</b></div></div><div class="route"><div class="copy"><small>Renderer</small><b>92 MB</b></div></div><div class="route"><div class="copy"><small>Processes</small><b>${2+(state.audio?1:0)+(state.capture?1:0)}</b></div></div></div></section></div>`;
}

function wirePage() {
  document.querySelectorAll('[data-go]').forEach(button => button.onclick = () => { state.page = button.dataset.go; render(); });
  document.querySelectorAll('[data-toggle]').forEach(button => button.onclick = () => {
    const kind = button.dataset.toggle;
    state[kind] = !state[kind];
    showToast(`${kind === 'audio' ? 'Audio host' : 'Capture host'} ${state[kind] ? 'started' : 'stopped'}`);
    render();
  });
  document.querySelectorAll('[data-device]').forEach(button => button.onclick = () => { state.selectedDevice = button.dataset.device; state.page = 'devices'; render(); });
  document.querySelectorAll('[data-module]').forEach(button => button.onclick = () => { const module = state.modules[Number(button.dataset.module)]; module.enabled = !module.enabled; if(module.kind==='audio') state.audio=module.enabled; if(module.kind==='capture') state.capture=module.enabled; showToast(`${module.name} ${module.enabled?'enabled':'disabled'}`); render(); });
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
