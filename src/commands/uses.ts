import logger from '../utils/logger.js'
import chalk from 'chalk'
import type { Command } from 'commander'

import { getSession } from '../services/session.js'
import { getProfileFromSession } from '../services/profile.js'
import { getUserPostCount, POST_LIMIT } from '../services/limits.js'
import { supabase } from '../services/supabase.js'

export function registerUsesCommand(program: Command): void {
  program
    .command('uses')
    .description('Show your current post usage.')
    .action(async () => {
      await handleUses()
    })
}

async function handleUses(): Promise<void> {
  try {
    const session = await getSession()

    if (!session) {
      logger.warn('You are not logged in.')
      console.log(chalk.gray('Run: prompt-it login'))
      return
    }

    await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token
    })

    const profile = await getProfileFromSession(session)
    const count = await getUserPostCount(profile.id)
    const remaining = POST_LIMIT - count

    logger.blank()
    logger.header('Post usage')
    console.log(chalk.gray('----------'))
    logger.property('Used:', `     ${count}/${POST_LIMIT}`)
    logger.property('Remaining:', `${remaining}`)
    logger.blank()

    if (count >= POST_LIMIT) {
      console.log(
        chalk.red(
          `Post limit reached. You have used ${count}/${POST_LIMIT} posts.\n` +
            `  Each prompt publish and each version update counts as 1 post.`
        )
      )
    } else if (remaining <= 10) {
      logger.warn(`Warning: only ${remaining} post(s) remaining.`)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error occurred.'

    logger.error(`Error: ${message}`)
  }
}
