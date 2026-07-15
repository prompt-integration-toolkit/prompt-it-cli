import logger from '../../utils/logger.js'
import { promptConfirm } from '../../utils/prompts.js'
import type { Command } from 'commander'

import { getSession, clearSession } from '../../services/session.js'

export function registerLogoutCommand(program: Command): void {
  program
    .command('logout')
    .description('Logout from your Prompt-it account.')
    .action(async () => {
      try {
        const session = await getSession()

        if (!session) {
          logger.warn('You are not logged in.')
          return
        }

        const shouldLogout = await promptConfirm({
          message: `Logout from ${session.user.email || 'current account'}?`,
          initialValue: true
        })

        if (!shouldLogout) {
          return
        }

        await clearSession()

        logger.success('Logged out successfully.', true)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unexpected error occurred.'

        logger.error(`Error: ${message}`)
      }
    })
}
