import { Mod } from './mod.js';
import { ModId } from './public/manifest';
import { ModDependency } from './public/mod';
import { compare } from '../common/dist/utils.js';
import { SemVer } from '../common/vendor-libs/semver.js';

type ModsMap = Map<ModId, Mod>;
type ReadonlyModsMap = ReadonlyMap<ModId, Mod>;
type ReadonlyVirtualPackagesMap = ReadonlyMap<ModId, SemVer>;

export function sortModsInLoadOrder(runtimeMod: Mod, installedMods: ReadonlyModsMap): ModsMap {
  // note that maps preserve insertion order as defined in the ECMAScript spec
  let sortedMods = new Map<ModId, Mod>();

  sortedMods.set(runtimeMod.manifest.id, runtimeMod);

  let unsortedModsList: Mod[] = [];
  for (let mod of installedMods.values()) {
    if (mod !== runtimeMod) unsortedModsList.push(mod);
  }
  unsortedModsList.sort((mod1, mod2) => compare(mod1.manifest.id, mod2.manifest.id));

  while (unsortedModsList.length > 0) {
    // dependency cycles can be detected by checking if we removed any
    // dependencies in this iteration, although see the comment below
    let dependencyCyclesExist = true;

    for (let i = 0; i < unsortedModsList.length; ) {
      let mod = unsortedModsList[i];
      if (!modHasUnsortedInstalledDependencies(mod, sortedMods, installedMods)) {
        unsortedModsList.splice(i, 1);
        sortedMods.set(mod.manifest.id, mod);
        dependencyCyclesExist = false;
      } else {
        i++;
      }
    }

    if (dependencyCyclesExist) {
      // Detection of **exactly** which mods caused this isn't implemented yet
      // because 2767mr said it isn't worth the effort (to which I agreed) for
      // now, but if you know how to do that - please implement. For anyone
      // interested google "circular dependency detection" or "detect graph edge
      // cycles" and you'll most likely find something useful for our case.
      throw new Error('Detected a dependency cycle');
    }
  }

  return sortedMods;
}

function modHasUnsortedInstalledDependencies(
  mod: Mod,
  sortedMods: ReadonlyModsMap,
  installedMods: ReadonlyModsMap,
): boolean {
  for (let depId of mod.dependencies.keys()) {
    if (!sortedMods.has(depId) && installedMods.has(depId)) return true;
  }
  return false;
}

export function verifyModDependencies(
  mod: Mod,
  installedMods: ReadonlyModsMap,
  virtualPackages: ReadonlyVirtualPackagesMap,
  loadedMods: ReadonlyModsMap,
): string[] {
  let problems = [];

  for (let [depId, dep] of mod.dependencies) {
    if (depId === mod.manifest.id) {
      problems.push("a mod can't depend on itself");
    } else {
      let problem = checkDependencyConstraint(
        depId,
        dep,
        installedMods,
        virtualPackages,
        loadedMods,
      );
      if (problem != null) problems.push(problem);
    }
  }

  return problems;
}

function checkDependencyConstraint(
  depId: ModId,
  depConstraint: ModDependency,
  installedMods: ReadonlyModsMap,
  virtualPackages: ReadonlyVirtualPackagesMap,
  loadedMods: ReadonlyModsMap,
): string | null {
  let availableDepVersion: SemVer;
  let depTitle = depId;

  let virtualPackageVersion = virtualPackages.get(depId);
  if (virtualPackageVersion != null) {
    availableDepVersion = virtualPackageVersion;
  } else {
    depTitle = `mod '${depId}'`;

    let depMod = installedMods.get(depId);
    if (depMod == null) {
      return depConstraint.optional ? null : `${depTitle} is not installed`;
    }

    if (!depMod.isEnabled) {
      return depConstraint.optional ? null : `${depTitle} is disabled`;
    }

    if (!loadedMods.has(depId)) {
      return depConstraint.optional ? null : `${depTitle} is not loaded`;
    }

    availableDepVersion = depMod.version;
  }

  if (!depConstraint.version.test(availableDepVersion)) {
    return `version of ${depTitle} (${availableDepVersion}) is not in range '${depConstraint.version}'`;
  }

  return null;
}
