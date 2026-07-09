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
          console.log(chalk.yellow('You are not logged in.'))
          console.log(chalk.gray('Run: prompt-it login'))
          return
        }

        console.log('')
        console.log(chalk.cyan('Prompt-it account'))
        console.log(chalk.gray('-----------------'))
        console.log(`${chalk.bold('User ID:')} ${session.user.id}`)
        console.log(`${chalk.bold('Email:')} ${session.user.email || 'unknown'}`)
        console.log('')

        outro(chalk.green('You are logged in.'))
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unexpected error occurred.'

        console.log(chalk.red(`Error: ${message}`))
      }
    })
}
