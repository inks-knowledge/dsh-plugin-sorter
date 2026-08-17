/**
 * State assembly and diagnostics for the sorter UI.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  INBOX_BUNDLES,
  insertedIdsForPackage,
  profileDir,
  readBundles,
  readDependencies,
  readInstalledManifest,
  readInstalledVersion,
  readOrganizer,
  readPatchState,
} from './profile.js'

const ROW_ID_RE = /^[A-Za-z0-9_.-]+$/u

function readReadme(profile, explicitDir, packageName) {
  const dir = join(profileDir(profile, explicitDir), 'node_modules', packageName)
  for (const name of ['README.zh.md', 'README.md', 'README.en.md']) {
    try {
      return readFileSync(join(dir, name), 'utf8')
    } catch {
      // Try next.
    }
  }
  return null
}

function packageDiagnostics({ packageName, spec, manifest, bundle, inDependencies, patchDisabled, bundleExists, allInsertedIds, duplicateIds }) {
  const errors = []
  const warnings = []
  if (bundle && !bundleExists) {
    errors.push({ code: 'missing-package', message: '在 bundle 栈中但 node_modules 里不存在' })
  }
  if (!bundle && !inDependencies) {
    errors.push({ code: 'orphan-package', message: '已安装但既不在 bundle 栈也不在 dependencies 中' })
  }
  if (inDependencies && spec === undefined) {
    errors.push({ code: 'missing-spec', message: 'dependencies 中没有该包的版本声明' })
  }
  if (manifest === null) {
    warnings.push({ code: 'no-manifest', message: '读取不到 package.json' })
  } else {
    const engines = manifest.engines
    if (engines?.node) {
      const wanted = String(engines.node)
      const current = process.version.replace(/^v/u, '')
      if (!nodeSatisfies(current, wanted)) {
        warnings.push({ code: 'engine-mismatch', message: `Node 版本要求 ${wanted}，当前 ${process.version}` })
      }
    }
    if (!manifest.repository && !manifest.homepage) {
      warnings.push({ code: 'no-repository', message: '未声明 repository / homepage，来源不便于审计' })
    }
    const dsh = manifest.dsh
    if (dsh !== undefined && typeof dsh !== 'object') {
      errors.push({ code: 'bad-dsh-field', message: 'package.json 的 dsh 字段格式异常' })
    }
  }
  if (bundle && patchDisabled) {
    warnings.push({ code: 'patch-disabled', message: '补丁层已禁用该插件的加载条目' })
  }
  const inserted = allInsertedIds.get(packageName) ?? []
  if (inserted.length === 0 && manifest !== null) {
    warnings.push({ code: 'no-loader-id', message: '未发现 bundle patch 插入的 loader 条目 id（纯客户端插件除外）' })
  }
  for (const id of inserted) {
    const owners = duplicateIds.get(id)
    if (owners && owners.length > 1) {
      errors.push({ code: 'loader-id-clash', message: `loader 条目 id「${id}」同时被 ${owners.join('、')} 占用，会导致启动失败` })
    }
  }
  return { errors, warnings }
}

function nodeSatisfies(current, range) {
  // Tiny semver-ish check supporting `^`, `>=`, `||`, and exact.
  try {
    const [major, minor, patch] = current.split('.').map((n) => Number.parseInt(n, 10))
    const parts = String(range).split(/\s*\|\|\s*/u)
    return parts.some((part) => {
      const trimmed = part.trim()
      if (trimmed === '') return false
      if (trimmed.startsWith('^')) {
        const [wantMajor, wantMinor, wantPatch] = trimmed.slice(1).split('.').map((n) => Number.parseInt(n, 10))
        if (major !== wantMajor) return false
        if (wantMajor === 0) return minor === wantMinor && patch >= wantPatch
        return minor >= wantMinor
      }
      if (trimmed.startsWith('>=')) {
        const [wantMajor, wantMinor, wantPatch] = trimmed.slice(2).split('.').map((n) => Number.parseInt(n, 10))
        if (major !== wantMajor) return major > wantMajor
        if (minor !== wantMinor) return minor > wantMinor
        return patch >= wantPatch
      }
      if (trimmed.startsWith('>')) {
        const [wantMajor, wantMinor, wantPatch] = trimmed.slice(1).split('.').map((n) => Number.parseInt(n, 10))
        if (major !== wantMajor) return major > wantMajor
        if (minor !== wantMinor) return minor > wantMinor
        return patch > wantPatch
      }
      return trimmed === current
    })
  } catch {
    return true
  }
}

export function buildState(host, config) {
  const { profile, profileDirectory, allowRestart, restartMode } = config
  const bundles = readBundles(profile, profileDirectory)
  const dependencies = readDependencies(profile, profileDirectory)
  const patch = readPatchState(profile, profileDirectory)
  const organizer = readOrganizer(profile, profileDirectory)

  const names = new Set()
  for (const name of Object.keys(dependencies)) names.add(name)
  for (const name of bundles) if (!INBOX_BUNDLES.has(name)) names.add(name)

  const allInsertedIds = new Map()
  for (const name of names) {
    allInsertedIds.set(name, insertedIdsForPackage(profile, profileDirectory, name))
  }
  const duplicateIds = new Map()
  for (const [name, ids] of allInsertedIds) {
    for (const id of ids) {
      if (!duplicateIds.has(id)) duplicateIds.set(id, [])
      if (!duplicateIds.get(id).includes(name)) duplicateIds.get(id).push(name)
    }
  }

  const plugins = [...names].sort((a, b) => a.localeCompare(b)).map((name) => {
    const manifest = readInstalledManifest(profile, profileDirectory, name)
    const spec = dependencies[name]
    const bundle = bundles.includes(name)
    const patchDisabled = (allInsertedIds.get(name) ?? []).some((id) => patch.disables.includes(id))
    const enabled = bundle && !patchDisabled && !INBOX_BUNDLES.has(name)
    const bundleExists = existsSync(join(profileDir(profile, profileDirectory), 'node_modules', name))
    const { errors, warnings } = packageDiagnostics({
      packageName: name,
      spec,
      manifest,
      bundle,
      inDependencies: Object.hasOwn(dependencies, name),
      patchDisabled,
      bundleExists,
      allInsertedIds,
      duplicateIds,
    })
    return {
      name,
      spec: spec ?? null,
      version: readInstalledVersion(profile, profileDirectory, name),
      description: manifest?.description ?? null,
      author: manifest?.author ?? null,
      repository: manifest?.repository?.url ?? manifest?.repository ?? null,
      homepage: manifest?.homepage ?? null,
      license: manifest?.license ?? null,
      bundle,
      patchDisabled,
      enabled,
      builtin: INBOX_BUNDLES.has(name),
      hasReadme: readReadme(profile, profileDirectory, name) !== null,
      insertedIds: allInsertedIds.get(name) ?? [],
      errors,
      warnings,
    }
  })

  const enabledNames = bundles.filter((name) => {
    if (INBOX_BUNDLES.has(name)) return false
    const patchDisabled = (allInsertedIds.get(name) ?? []).some((id) => patch.disables.includes(id))
    return !patchDisabled
  })
  const disabledNames = plugins
    .filter((p) => !p.builtin && !p.enabled)
    .map((p) => p.name)

  const actual = {
    bundles,
    enabled: enabledNames,
    disabled: disabledNames,
  }
  const draft = organizer.draft ?? actual

  return {
    profile,
    profileDirectory,
    actual,
    draft,
    groups: organizer.groups ?? [],
    groupByPlugin: organizer.groupByPlugin ?? {},
    notes: organizer.notes ?? {},
    patch,
    plugins,
    restart: {
      allowed: allowRestart,
      mode: restartMode,
    },
  }
}

export function readPluginDetail(profile, explicitDir, packageName) {
  const manifest = readInstalledManifest(profile, explicitDir, packageName)
  const readme = readReadme(profile, explicitDir, packageName)
  return { name: packageName, manifest, readme }
}
