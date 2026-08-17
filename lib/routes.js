/**
 * HTTP routes for dsh-plugin-sorter. The host mounts these on the profile's
 * webServer; the browser client talks to them with same-origin fetch.
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  INBOX_BUNDLES,
  insertedIdsForPackage,
  patchPathFor,
  profileDir,
  readBundles,
  readDependencies,
  readInstalledManifest,
  readOrganizer,
  readPatchState,
  readProfileManifest,
  setRowDisabled,
  writeOrganizer,
  writeProfileManifest,
} from './profile.js'
import { buildState, readPluginDetail } from './state.js'

/** Architecture entries that must never be disabled through the sorter. */
const PROTECTED_MODULE_PATTERNS = [
  /^cordis:/u,
  /^@deepseek-ai\/cordis-plugin-/u,
  /^@deepseek-ai\/dsh-host-/u,
  /^@deepseek-ai\/dsh-client-modules$/u,
  /^@deepseek-ai\/dsh-client-connection$/u,
  /^@deepseek-ai\/dsh-client-hmr$/u,
  /^@deepseek-ai\/dsh-client-runtime$/u,
  /^@deepseek-ai\/dsh-client-locale$/u,
  /^@deepseek-ai\/dsh-client-web/u,
  /^@deepseek-ai\/dsh-web-frontend$/u,
  /^@deepseek-ai\/dsh-web-app$/u,
  /^@deepseek-ai\/dsh-settings/u,
  /^@deepseek-ai\/dsh-credentials/u,
  /^@deepseek-ai\/dsh-session/u,
  /^@deepseek-ai\/dsh-storage/u,
  /^@deepseek-ai\/dsh-typert/u,
  /^@deepseek-ai\/dsh-api-remotes$/u,
  /^@deepseek-ai\/dsh-tools$/u,
  /^@deepseek-ai\/dsh-system-prompt$/u,
  /^@deepseek-ai\/dsh-agent/u,
  /^@deepseek-ai\/dsh-llm/u,
  /^@deepseek-ai\/dsh-persona$/u,
  /^@deepseek-ai\/dsh-scope$/u,
  /^@deepseek-ai\/dsh-launch-environment$/u,
  /^@deepseek-ai\/dsh-shell$/u,
  /^@deepseek-ai\/dsh-subprocess/u,
  /^@deepseek-ai\/dsh-fs/u,
  /^@deepseek-ai\/dsh-sandbox/u,
  /^@deepseek-ai\/dsh-jobs/u,
  /^@deepseek-ai\/dsh-skill/u,
  /^@deepseek-ai\/dsh-goal/u,
  /^@deepseek-ai\/dsh-workflow/u,
  /^@deepseek-ai\/dsh-subagent/u,
  /^@deepseek-ai\/dsh-web$/u,
  /^@deepseek-ai\/dsh-workspace/u,
  /^@deepseek-ai\/dsh-user-approval$/u,
  /^@deepseek-ai\/dsh-user-questions$/u,
  /^@deepseek-ai\/dsh-commands$/u,
  /^@deepseek-ai\/dsh-hook/u,
  /^@deepseek-ai\/dsh-spill/u,
  /^@deepseek-ai\/dsh-guard/u,
]

function isProtectedEntry(name) {
  return typeof name === 'string' && PROTECTED_MODULE_PATTERNS.some((pattern) => pattern.test(name))
}

const requireFromSorter = createRequire(import.meta.url)

function resolvePackageMeta(config, name) {
  try {
    const manifest = readInstalledManifest(config.profile, config.profileDirectory, name)
    if (manifest) return manifest
  } catch {
    // fall through to installation resolution
  }
  try {
    const resolved = requireFromSorter.resolve(name)
    let dir = dirname(resolved)
    for (let depth = 0; depth < 8; depth += 1) {
      try {
        return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
      } catch {
        dir = dirname(dir)
      }
    }
  } catch {
    // not resolvable as a package
  }
  return null
}

function sendJson(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(value))
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = ''
    request.setEncoding('utf8')
    request.on('data', (chunk) => {
      body += chunk
      if (body.length > 1024 * 1024) {
        reject(new Error('request body too large'))
        request.destroy()
      }
    })
    request.on('end', () => {
      if (body === '') {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(body))
      } catch (error) {
        reject(error)
      }
    })
    request.on('error', reject)
  })
}

function loopbackNoForwarding(request) {
  const address = request.socket.remoteAddress
  if (address !== '127.0.0.1' && address !== '::1' && address !== '::ffff:127.0.0.1') return false
  if (request.headers.forwarded !== undefined
    || request.headers['x-forwarded-for'] !== undefined
    || request.headers['x-real-ip'] !== undefined) return false
  return true
}

function sameOrigin(request) {
  if (!loopbackNoForwarding(request)) return false
  const origin = request.headers.origin
  const host = request.headers.host
  if (origin === undefined || host === undefined) return false
  try {
    const parsed = new URL(origin)
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.host === host
  } catch {
    return false
  }
}

/** GET reads allow a missing Origin: same-origin browser GETs omit it. */
function trustedGet(request) {
  if (!loopbackNoForwarding(request)) return false
  const host = request.headers.host
  if (host === undefined) return false
  const origin = request.headers.origin
  if (origin === undefined) return true
  try {
    const parsed = new URL(origin)
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.host === host
  } catch {
    return false
  }
}

function safeName(value) {
  return typeof value === 'string' && /^[A-Za-z0-9@._-]+$/u.test(value)
}

/** Relaunch the exact DSH entry, then stop this host. */
function scheduleRestart() {
  const entry = process.argv[1]
  const executable = process.execPath
  const execArgv = [...process.execArgv]
  const args = [...process.argv.slice(2)]
  const spawnFile = process.platform === 'win32' ? 'powershell.exe' : executable
  const spawnArgs = process.platform === 'win32'
    ? ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', buildPowerShellRestartCommand(executable, execArgv, entry, args)]
    : [...execArgv, entry, ...args]
  const cwd = process.cwd()
  const child = spawn(spawnFile, spawnArgs, {
    cwd,
    stdio: 'ignore',
    env: process.env,
    windowsHide: true,
  })
  child.unref()
  setTimeout(() => process.kill(process.pid, 'SIGTERM'), 500)
  return { pid: process.pid, childPid: child.pid }
}

function buildPowerShellRestartCommand(executable, execArgv, entry, args) {
  const quote = (part) => `'${part.replace(/'/g, "''")}'`
  const head = execArgv.length > 0
    ? [quote(executable), ...execArgv.map(quote), quote(entry)]
    : [quote(executable), quote(entry)]
  return ['&', ...head, ...args.map(quote)].join(' ')
}

const ROW_ID_RE = /^[A-Za-z0-9_.-]+$/u

function planApply(config, draft) {
  const { profile, profileDirectory } = config
  const manifest = readProfileManifest(profile, profileDirectory)
  const bundles = Array.isArray(manifest.dsh?.profile?.bundles) ? [...manifest.dsh.profile.bundles] : []
  const dependencies = manifest.dependencies ?? {}

  const enabled = Array.isArray(draft?.enabled) ? draft.enabled : []
  const disabled = Array.isArray(draft?.disabled) ? draft.disabled : []

  // Reorder the community packages in the bundle stack, keeping in-box
  // bundles at the front where the profile template expects them.
  const builtin = bundles.filter((name) => INBOX_BUNDLES.has(name))
  const community = enabled.filter((name) => {
    return (bundles.includes(name) || dependencies[name] !== undefined) && !INBOX_BUNDLES.has(name)
  })
  const newBundles = [...builtin, ...community]

  const wantedDisabled = new Set(disabled)
  const wantedEnabled = new Set(enabled)
  const tasks = []
  for (const name of new Set([...wantedEnabled, ...wantedDisabled])) {
    if (INBOX_BUNDLES.has(name)) continue
    const ids = insertedIdsForPackage(profile, profileDirectory, name)
    const shouldDisable = wantedDisabled.has(name)
    for (const id of ids) {
      if (ROW_ID_RE.test(id)) tasks.push({ id, shouldDisable })
    }
  }
  return { newBundles, tasks }
}

export function createHostRoutes(host, config) {
  const routes = [
    {
      path: '/dsh-plugin-sorter/state',
      method: 'GET',
      handler: (request, response) => {
        if (!trustedGet(request)) {
          sendJson(response, 403, { error: 'untrusted origin' })
          return
        }
        try {
          sendJson(response, 200, buildState(host, config))
        } catch (error) {
          sendJson(response, 500, { error: error.message })
        }
      },
    },
    {
      path: '/dsh-plugin-sorter/plugin',
      method: 'GET',
      handler: (request, response) => {
        if (!trustedGet(request)) {
          sendJson(response, 403, { error: 'untrusted origin' })
          return
        }
        const url = new URL(request.url, 'http://localhost')
        const name = url.searchParams.get('name')
        if (!safeName(name)) {
          sendJson(response, 400, { error: 'invalid plugin name' })
          return
        }
        try {
          const detail = readPluginDetail(config.profile, config.profileDirectory, name)
          if (detail.manifest === null && detail.readme === null) {
            sendJson(response, 404, { error: 'plugin not found' })
            return
          }
          sendJson(response, 200, detail)
        } catch (error) {
          sendJson(response, 500, { error: error.message })
        }
      },
    },
    {
      path: '/dsh-plugin-sorter/entries',
      method: 'GET',
      handler: (request, response) => {
        if (!trustedGet(request)) {
          sendJson(response, 403, { error: 'untrusted origin' })
          return
        }
        try {
          const patch = readPatchState(config.profile, config.profileDirectory)
          const rows = []
          for (const entry of host.loader.entries()) {
            const options = entry.options ?? entry
            const id = options?.id ?? entry?.id ?? null
            const name = options?.name ?? entry?.name ?? null
            if (id === null && name === null) continue
            let description = null
            let version = null
            let repository = null
            if (typeof name === 'string') {
              const manifest = resolvePackageMeta(config, name)
              if (manifest) {
                description = manifest.description ?? null
                version = manifest.version ?? null
                repository = typeof manifest.repository === 'string'
                  ? manifest.repository
                  : manifest.repository?.url ?? null
              }
            }
            rows.push({
              id,
              name,
              description,
              version,
              repository,
              patchDisabled: typeof id === 'string' && patch.disables.includes(id),
              patchForced: typeof id === 'string' && patch.forces.includes(id),
              protected: isProtectedEntry(name),
            })
          }
          sendJson(response, 200, { rows })
        } catch (error) {
          sendJson(response, 500, { error: error.message })
        }
      },
    },
    {
      path: '/dsh-plugin-sorter/toggle-entry',
      method: 'POST',
      handler: async (request, response) => {
        if (!sameOrigin(request)) {
          sendJson(response, 403, { error: 'untrusted origin' })
          return
        }
        try {
          const body = await readJsonBody(request)
          const id = typeof body.id === 'string' ? body.id : ''
          const enabled = body.enabled === true
          if (!ROW_ID_RE.test(id)) {
            sendJson(response, 400, { error: 'invalid loader entry id' })
            return
          }
          const name = body.name ?? id
          if (isProtectedEntry(name)) {
            sendJson(response, 403, { error: `loader 条目 ${id} 属于受保护架构条目，禁止启停` })
            return
          }
          const patchFile = patchPathFor(host, config.profile, config.profileDirectory)
          const result = await setRowDisabled(patchFile, id, !enabled)
          if (!result.ok) {
            sendJson(response, 400, { error: result.reason })
            return
          }
          sendJson(response, 200, { ok: true, id, enabled })
        } catch (error) {
          sendJson(response, 500, { error: error.message })
        }
      },
    },
    {
      path: '/dsh-plugin-sorter/draft',
      method: 'POST',
      handler: async (request, response) => {
        if (!sameOrigin(request)) {
          sendJson(response, 403, { error: 'untrusted origin' })
          return
        }
        try {
          const body = await readJsonBody(request)
          const organizer = readOrganizer(config.profile, config.profileDirectory)
          const next = {
            groups: Array.isArray(body.groups) ? body.groups : organizer.groups,
            groupByPlugin: body.groupByPlugin && typeof body.groupByPlugin === 'object' ? body.groupByPlugin : organizer.groupByPlugin,
            notes: body.notes && typeof body.notes === 'object' ? body.notes : organizer.notes,
            draft: body.draft && typeof body.draft === 'object' ? body.draft : organizer.draft,
          }
          writeOrganizer(config.profile, config.profileDirectory, next)
          sendJson(response, 200, { ok: true })
        } catch (error) {
          sendJson(response, 500, { error: error.message })
        }
      },
    },
    {
      path: '/dsh-plugin-sorter/apply',
      method: 'POST',
      handler: async (request, response) => {
        if (!sameOrigin(request)) {
          sendJson(response, 403, { error: 'untrusted origin' })
          return
        }
        try {
          const body = await readJsonBody(request)
          const draft = body.draft
          const groups = Array.isArray(body.groups) ? body.groups : []
          const groupByPlugin = body.groupByPlugin && typeof body.groupByPlugin === 'object' ? body.groupByPlugin : {}
          const notes = body.notes && typeof body.notes === 'object' ? body.notes : {}
          const { newBundles, tasks } = planApply(config, draft)
          const patchFile = patchPathFor(host, config.profile, config.profileDirectory)
          const failures = []
          for (const task of tasks) {
            const result = await setRowDisabled(patchFile, task.id, task.shouldDisable)
            if (!result.ok) failures.push(`${task.id}: ${result.reason}`)
          }
          if (failures.length > 0) {
            sendJson(response, 502, { ok: false, errors: failures })
            return
          }
          // Apply the reordered bundle stack only after every patch row
          // succeeded, so a patch failure leaves the manifest untouched.
          const manifest = readProfileManifest(config.profile, config.profileDirectory)
          if (manifest.dsh === undefined) manifest.dsh = {}
          if (manifest.dsh.profile === undefined) manifest.dsh.profile = {}
          manifest.dsh.profile.bundles = newBundles
          writeProfileManifest(config.profile, config.profileDirectory, manifest)
          writeOrganizer(config.profile, config.profileDirectory, {
            groups,
            groupByPlugin,
            notes,
            draft: null,
          })
          sendJson(response, 200, {
            ok: true,
            restart: {
              automatic: false,
              required: true,
              mode: 'manual',
            },
          })
        } catch (error) {
          sendJson(response, 500, { ok: false, error: error.message, stack: error.stack })
        }
      },
    },
  ]

  const disposers = []
  for (const route of routes) {
    const dispose = host.webServer.register({
      kind: 'exact',
      path: route.path,
      handler: (request, response) => {
        if (request.method !== route.method) {
          response.writeHead(405, { allow: route.method })
          response.end()
          return
        }
        void Promise.resolve()
          .then(() => route.handler(request, response))
          .catch((error) => {
            if (!response.headersSent) sendJson(response, 500, { error: error.message })
            else response.end()
          })
      },
    })
    disposers.push(dispose)
  }
  return () => {
    for (const dispose of disposers) {
      try {
        dispose()
      } catch {
        // Already disposed.
      }
    }
  }
}
