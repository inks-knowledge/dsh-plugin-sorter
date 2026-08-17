/**
 * dsh-plugin-sorter host entry: reads the active profile, exposes a
 * RimCrow-style plugin sorter API, and applies draft edits to the profile's
 * bundle order and patch layer. Restarts are always left to the user.
 */
import { createHostRoutes } from './routes.js'
import { profileDir } from './profile.js'

export const name = 'dsh-plugin-sorter'

function argvProfile() {
  const argv = process.argv
  const flag = argv.indexOf('--profile')
  if (flag !== -1 && flag + 1 < argv.length && !argv[flag + 1].startsWith('-')) return argv[flag + 1]
  return 'web'
}

export function apply(ctx, config = {}) {
  ctx.inject(['webServer', 'loader'], (hostCtx) => {
    const desktopProfiles = hostCtx.get('desktopProfiles') ?? ctx.get('desktopProfiles')
    const profile = desktopProfiles?.current?.name || (config.profile ?? argvProfile())
    const profileDirectory = desktopProfiles?.current?.dir ?? config.profileDirectory ?? profileDir(profile)
    const resolved = {
      profile,
      profileDirectory,
      allowRestart: false,
      restartMode: 'manual',
    }
    const host = hostCtx
    host.effect(() => createHostRoutes(host, resolved), 'dsh-plugin-sorter: http routes')
  })
}
