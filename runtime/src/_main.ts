import * as paths from '../../common/dist/paths.js';
import * as utils from '../../common/dist/utils.js';
import requireFixed from '../../common/dist/require.js';
import * as semver from '../../common/vendor-libs/semver.js';

import * as patchList from './patch-list.js';
import * as impactInitHooks from './impact-init-hooks.js';
import * as impactModuleHooks from './impact-module-hooks.js';
import * as resources from './resources.js';
import './resources-injections.js';
import './lang-file-patcher.js';
import './greenworks-fix.js';

export default class RuntimeModMainClass implements modloader.Mod.MainClass {
  public constructor(mod: modloader.Mod) {
    if (window.ccmod == null) window.ccmod = {} as typeof ccmod;
    Object.assign<typeof ccmod, Partial<typeof ccmod>>(window.ccmod, {
      implementor: modloader.name,
      implementation: mod.id,
      paths,
      utils,
      require: requireFixed,
      semver,
      patchList,
      impactInitHooks,
      impactModuleHooks,
      resources,
    });
  }

  public onImpactInit(): void {
    for (let cb of impactInitHooks.callbacks) cb();
  }

  public async postload(): Promise<void> {
    await import('./_postload.js');
  }
}
