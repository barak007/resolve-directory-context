import fs from 'fs';
import path from 'path';
import findUp from 'find-up';
import type { PackageJson } from 'type-fest';
import { resolveWorkspacePackages, extractPackageLocations } from './yarn-workspaces';
import { isPlainObject, isString } from './language-helpers';
import { INpmPackage, PACKAGE_JSON, resolveLinkedPackages, sortPackagesByDepth } from './npm-package';

export interface SinglePackageContext {
  type: 'single';
  npmPackage: INpmPackage;
}

export interface MultiPackageContext {
  type: 'multi';
  rootPackage: INpmPackage;
  packages: INpmPackage[];
}

export function resolveDirectoryContext(basePath: string): SinglePackageContext | MultiPackageContext {
  const packageJsonPath = findUp.sync(PACKAGE_JSON, { cwd: basePath });

  if (!isString(packageJsonPath)) {
    throw new Error(`Cannot find ${PACKAGE_JSON} for ${basePath}`);
  }

  const directoryPath = path.dirname(packageJsonPath);

  const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf8');
  const packageJson = JSON.parse(packageJsonContent) as PackageJson;
  if (!isPlainObject(packageJson)) {
    throw new Error(`${packageJsonPath} is not a valid json object.`);
  }

  const displayName = packageJson.name ? packageJson.name : packageJsonPath;

  const rootPackage: INpmPackage = {
    displayName,
    directoryPath,
    packageJson,
    packageJsonPath,
    packageJsonContent,
  };
  const { workspaces } = rootPackage.packageJson;

  if (workspaces !== undefined) {
    return {
      type: 'multi',
      rootPackage,
      packages: sortPackagesByDepth(
        resolveWorkspacePackages(directoryPath, extractPackageLocations(packageJson.workspaces))
      ),
    };
  }

  const lernaJsonPath = path.join(directoryPath, 'lerna.json');
  if (fs.existsSync(lernaJsonPath)) {
    const lernaJsonContents = fs.readFileSync(lernaJsonPath, 'utf8');
    const lernaJson = JSON.parse(lernaJsonContents) as { packages?: string[] };
    if (isPlainObject(packageJson) && Array.isArray(lernaJson.packages)) {
      return {
        type: 'multi',
        rootPackage,
        packages: sortPackagesByDepth(
          resolveWorkspacePackages(directoryPath, extractPackageLocations(lernaJson.packages))
        ),
      };
    }
  }

  const linkedPackages = resolveLinkedPackages(rootPackage);
  if (linkedPackages.length) {
    return {
      type: 'multi',
      rootPackage,
      packages: sortPackagesByDepth(linkedPackages),
    };
  }

  return {
    type: 'single',
    npmPackage: rootPackage,
  };
}

export function childPackagesFromContext(context: SinglePackageContext | MultiPackageContext): INpmPackage[] {
  return context.type === 'single' ? [context.npmPackage] : [...context.packages];
}

export function allPackagesFromContext(context: SinglePackageContext | MultiPackageContext): INpmPackage[] {
  return context.type === 'single' ? [context.npmPackage] : [context.rootPackage, ...context.packages];
}
