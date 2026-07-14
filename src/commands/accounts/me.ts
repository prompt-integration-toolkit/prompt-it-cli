import logger from '../../utils/logger.js'
import chalk from 'chalk'
import { outro } from '@clack/prompts'
import type { Command } from 'commander'

import { getSession } from '../../services/session.js'

export function registerMeCommand(program: Command): void {
  program
    .command('me')
    .description('Show the currently logged in Prompt-it user.')
    .action(async () => {
      try {
        const session = await getSession()

        if (!session) {
          logger.warn('You are not logged in.')
          console.log(chalk.gray('Run: prompt-it login'))
          return
        }

        logger.blank()
        logger.header('Prompt-it account')
        console.log(chalk.gray('-----------------'))
        logger.property('User ID:', `${session.user.id}`)
        logger.property('Email:', `${session.user.email || 'unknown'}`)
        logger.blank()

        logger.success('You are logged in.', true)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unexpected error occurred.'

        logger.error(`Error: ${message}`)
      }
    })
}
