/**
 * Profile filesystem helpers: manifest, bundle stack, patch-layer state,
 * installed package manifests and the sorter's own organizer JSON.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'

export const SORTER_FILE = 'dsh-plugin-sorter.json'

export const INBOX_BUNDLES = new Set([
  '@deepseek-ai/dsh-base',
  '@deepseek-ai/dsh-web-app',
  '@deepseek-ai/dsh-headless',
])

export function profileDir(profile, explicitDir) {
  if (explicitDir !== undefined) return explicitDir
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  return join(home, 'profiles', profile)
}

export function readJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

export function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}

export function readProfileManifest(profile, explicitDir) {
  return readJson(join(profileDir(profile, explicitDir), 'package.json'), {})
}

export function writeProfileManifest(profile, explicitDir, manifest) {
  const file = join(profileDir(profile, explicitDir), 'package.json')
  writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`)
}

export function readBundles(profile, explicitDir) {
  const manifest = readProfileManifest(profile, explicitDir)
  return Array.isArray(manifest.dsh?.profile?.bundles) ? [...manifest.dsh.profile.bundles] : []
}

export function readDependencies(profile, explicitDir) {
  const manifest = readProfileManifest(profile, explicitDir)
  return manifest.dependencies && typeof manifest.dependencies === 'object'
    ? { ...manifest.dependencies }
    : {}
}

export function readInstalledManifest(profile, explicitDir, packageName) {
  const file = join(profileDir(profile, explicitDir), 'node_modules', packageName, 'package.json')
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

export function readInstalledVersion(profile, explicitDir, packageName) {
  return readInstalledManifest(profile, explicitDir, packageName)?.version ?? null
}

/**
 * The id(s) a package inserts through its declared bundle patch. This is
 * what a user patch row `- id: X` + `disabled: true` must target.
 */
export function insertedIdsForPackage(profile, explicitDir, packageName) {
  const dir = join(profileDir(profile, explicitDir), 'node_modules', packageName)
  const ids = new Set()
  const manifest = readJson(join(dir, 'package.json'), null)
  const patchFile = typeof manifest?.dsh?.bundle?.patch === 'string'
    ? manifest.dsh.bundle.patch
    : null
  const candidates = []
  if (patchFile !== null) candidates.push(join(dir, patchFile))
  candidates.push(join(dir, 'cordis.patch.yml'))
  for (const file of candidates) {
    try {
      const text = readFileSync(file, 'utf8')
      const rows = yaml.load(text)
      collectInsertIds(rows, ids)
    } catch {
      // No patch file or unreadable — fall through.
    }
  }
  return [...ids]
}

function collectInsertIds(node, ids) {
  if (Array.isArray(node)) {
    for (const row of node) collectInsertIds(row, ids)
    return
  }
  if (node && typeof node === 'object') {
    if (Array.isArray(node.insert)) {
      for (const row of node.insert) {
        if (row && typeof row.id === 'string' && row.id !== '') ids.add(row.id)
      }
    }
    if (typeof node.id === 'string' && node.id !== '') ids.add(node.id)
    for (const value of Object.values(node)) collectInsertIds(value, ids)
  }
}

/**
 * Line-wise patch-layer state. Mirrors the shapes the community managers
 * use: top-level `- id: X` rows followed by `  disabled: true|false`.
 */
export function readPatchState(profile, explicitDir) {
  const file = join(profileDir(profile, explicitDir), 'cordis.patch.yml')
  const disables = []
  const forces = []
  let text = ''
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    // No patch file — empty state.
  }
  const lines = text.split(/\r?\n/u)
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^- id:\s*['"]?([A-Za-z0-9_.-]+)/u.exec(lines[index] ?? '')
    if (match === null) continue
    const next = lines[index + 1] ?? ''
    if (/^\s*disabled:\s*true\s*$/u.test(next)) disables.push(match[1])
    else if (/^\s*disabled:\s*false\s*$/u.test(next)) forces.push(match[1])
  }
  return { disables, forces }
}

/** The organizer JSON: groups, notes, and the un-applied draft. */
export function readOrganizer(profile, explicitDir) {
  const file = join(profileDir(profile, explicitDir), SORTER_FILE)
  return readJson(file, { groups: [], groupByPlugin: {}, notes: {}, draft: null })
}

export function writeOrganizer(profile, explicitDir, organizer) {
  const file = join(profileDir(profile, explicitDir), SORTER_FILE)
  writeJson(file, organizer)
}

/** Resolve the profile's patch file path from the loader when possible. */
export function findPatchPath(host, profile, explicitDir) {
  const fallback = join(profileDir(profile, explicitDir), 'cordis.patch.yml')
  try {
    for (const entry of host.loader.entries()) {
      const options = entry.options ?? {}
      if (options.name !== 'cordis:include') continue
      const cfgPath = options.config?.path
      if (typeof cfgPath !== 'string') continue
      let includePath = cfgPath
      if (includePath.startsWith('file://')) {
        try {
          includePath = fileURLToPath(includePath)
        } catch {
          includePath = includePath.replace(/^file:\/\/\//u, '')
        }
      }
      return includePath.replace(/cordis\.yml$/u, 'cordis.patch.yml')
    }
  } catch {
    // loader entries unavailable — fallback.
  }
  return fallback
}

export function patchPathFor(host, profile, explicitDir) {
  return findPatchPath(host, profile, explicitDir)
}

/** Serialize writes to the patch file. */
let patchQueue = Promise.resolve()
function queuedPatchWrite(fn) {
  const run = patchQueue.then(fn, fn)
  patchQueue = run.then(() => undefined, () => undefined)
  return run
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

function rowBlock(rowId, disabled) {
  return `- id: ${rowId}\n  disabled: ${disabled ? 'true' : 'false'}\n`
}

export function appendPatchRow(patchFile, block) {
  let text = ''
  try {
    text = readFileSync(patchFile, 'utf8')
  } catch {
    // Created below.
  }
  const core = text.trim()
  if (core === '') {
    writeFileSync(patchFile, block)
    return { ok: true, reason: null }
  }
  const withoutComments = text.replace(/^[ \t]*#.*$/gmu, '').trim()
  if (withoutComments === '') {
    const next = text.endsWith('\n') ? text : `${text}\n`
    writeFileSync(patchFile, `${next}${block}`)
    return { ok: true, reason: null }
  }
  if (withoutComments === '[]' || withoutComments === '[ ]') {
    const commented = text.replace(/^[ \t]*\[[ \t]*\][ \t]*(?:#.*)?(?:\r?\n|$)/mu, '# []\n')
    const next = commented.endsWith('\n') ? commented : `${commented}\n`
    writeFileSync(patchFile, `${next}${block}`)
    return { ok: true, reason: null }
  }
  const lastContentLine = text.split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
    .pop() ?? ''
  if (/^[[{]/u.test(lastContentLine)) {
    return { ok: false, reason: '补丁层以顶层流式结构结尾，无法自动追加条目' }
  }
  const next = text.endsWith('\n') ? text : `${text}\n`
  writeFileSync(patchFile, `${next}${block}`)
  return { ok: true, reason: null }
}

export function setRowDisabled(patchFile, rowId, disabled) {
  return queuedPatchWrite(async () => {
    if (!/^[A-Za-z0-9_.-]+$/u.test(rowId)) {
      return { ok: false, reason: `row id ${rowId} cannot be written to the patch layer` }
    }
    const state = readPatchStateFromFile(patchFile)
    const blockRe = new RegExp(`^- id: ['\"]?${escapeRegExp(rowId)}['\"]?\\r?\\n\\s*disabled: (?:true|false)\\s*\\r?\\n`, 'mu')
    let text = ''
    try {
      text = readFileSync(patchFile, 'utf8')
    } catch {
      // Created below.
    }
    if (disabled) {
      if (state.disables.includes(rowId)) return { ok: true, reason: null }
      text = text.replace(blockRe, '')
      const result = appendPatchRow(patchFile, rowBlock(rowId, true))
      return result.ok ? { ok: true, reason: null } : result
    } else {
      // Enabling: remove existing disable blocks; if a force block already
      // exists, keep it, otherwise add force block.
      text = text.replace(new RegExp(`^- id: ['\"]?${escapeRegExp(rowId)}['\"]?\\r?\\n\\s*disabled: true\\s*\\r?\\n`, 'mu'), '')
      writeFileSync(patchFile, text)
      const stateAfter = readPatchStateFromFile(patchFile)
      if (stateAfter.forces.includes(rowId)) return { ok: true, reason: null }
      const result = appendPatchRow(patchFile, rowBlock(rowId, false))
      return result.ok ? { ok: true, reason: null } : result
    }
  })
}

function readPatchStateFromFile(patchFile) {
  const disables = []
  const forces = []
  let text = ''
  try {
    text = readFileSync(patchFile, 'utf8')
  } catch {
    return { disables, forces }
  }
  const lines = text.split(/\r?\n/u)
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^- id:\s*['"]?([A-Za-z0-9_.-]+)/u.exec(lines[index] ?? '')
    if (match === null) continue
    const next = lines[index + 1] ?? ''
    if (/^\s*disabled:\s*true\s*$/u.test(next)) disables.push(match[1])
    else if (/^\s*disabled:\s*false\s*$/u.test(next)) forces.push(match[1])
  }
  return { disables, forces }
}
