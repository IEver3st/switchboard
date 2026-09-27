import {createDefaultSnapshot} from '../../src/shared/defaults';
import {writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
const dir=resolve(import.meta.dir,'profile'); mkdirSync(dir,{recursive:true});
const s=createDefaultSnapshot();
s.modules.forEach(m=>{m.enabled=m.kind==='device'});
Object.assign(s.settings,{onboardingCompleted:true,uiScalePercent:100,automaticAppUpdates:false,automaticAppUpdateDownloads:false,automaticModuleUpdates:false,scanGamesAutomatically:false,visibleWorkspaces:['devices','audio','capture']});
s.capture.config.enabled=false;s.capture.config.clipsDirectory=resolve(dir,'Clips');s.audio.enabled=false;
writeFileSync(resolve(dir,'switchboard-state.json'),JSON.stringify(s));
