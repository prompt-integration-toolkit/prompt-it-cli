import logger from '../utils/logger.js'
import chalk from 'chalk'
import { diffLines } from 'diff'
import type { Command } from 'commander'

import { supabase } from '../services/supabase.js'
import { getSession } from '../services/session.js'
import { getPromptContentByVersion } from '../utils/promptResolver.js'
import { compareSemver } from '../utils/semver.js'

export function registerListCommand(program: Command): void {
  program
    .command('list')
    .description('List your prompts, view prompt history, or compare versions.')
    .argument('[target]', 'Target prompt. Example: "my-prompt" or "my-prompt@1.0.1"')
    .action(async (target: string | undefined) => {
      try {
        // @username lookup — does not require login
        if (target && target.startsWith('@')) {
          const raw = target.slice(1) // remove the @

          if (raw.includes('/')) {
            logger.validation('Invalid format. Use prompt-it get ' + raw + ' to get a specific prompt.')
            return
          }

          if (!raw) {
            logger.error('Username is required. Use: prompt-it list @<username>')
            return
          }

          await listUserPublicPrompts(raw)
          return
        }

        const session = await getSession()

        if (!session) {
          logger.error('You must be logged in to use this command.')
          return
        }

        if (!target) {
          await listAllPrompts(session.user.id)
          return
        }

        if (target.includes('@')) {
          const [promptName, version] = target.split('@')
          if (!promptName || !version) {
            logger.error('Invalid format. Use <prompt-name>@<version>.')
            return
          }
          await showVersionDiff(session.user.id, promptName, version)
          return
        }

        await listPromptDetails(session.user.id, target)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unexpected error occurred.'
        logger.error(`Error: ${message}`)
      }
    })
}

async function listAllPrompts(userId: string): Promise<void> {
  const { data, error } = await supabase
    .from('prompts')
    .select('name, current_version, description')
    .eq('owner_id', userId)
    .eq('status', 'active')
    .order('name')

  if (error) {
    throw new Error(`Could not fetch prompts: ${error.message}`)
  }

  const prompts = data ?? []

  if (prompts.length === 0) {
    logger.warn('No prompts found.')
    return
  }

  logger.info(`\nYour Prompts [${prompts.length}]\n`)

  prompts.forEach((prompt, index) => {
    logger.info(chalk.bold(`${index + 1}. ${prompt.name}`))

    if (prompt.description) {
      logger.info(chalk.gray(`   ${prompt.description}`))
    } else {
      logger.info(chalk.gray(`   No description`))
    }

    logger.info(chalk.gray(`   Version: v${prompt.current_version}`))
    logger.blank()
  })
}

async function listPromptDetails(userId: string, promptName: string): Promise<void> {
  const { data: prompt, error: promptError } = await supabase
    .from('prompts')
    .select('id, description, created_at')
    .eq('owner_id', userId)
    .eq('name', promptName)
    .eq('status', 'active')
    .maybeSingle()

  if (promptError) {
    throw new Error(`Could not fetch prompt: ${promptError.message}`)
  }

  if (!prompt) {
    logger.error(`Prompt not found: ${promptName}`)
    return
  }

  const { data: versions, error: versionsError } = await supabase
    .from('prompt_versions')
    .select('version, created_at')
    .eq('prompt_id', prompt.id)
    .is('deleted_at', null)

  if (versionsError) {
    throw new Error(`Could not fetch prompt versions: ${versionsError.message}`)
  }

  const sortedVersions = (versions ?? []).sort((a, b) => compareSemver(b.version, a.version))

  logger.info(`\n• ${chalk.bold(promptName)}\n`)
  logger.info(`Description: ${prompt.description || 'No description'}`)
  logger.info(`Created at: ${new Date(prompt.created_at).toISOString().split('T')[0]}\n`)
  logger.info('Version History:')

  for (let i = 0; i < sortedVersions.length; i++) {
    const v = sortedVersions[i]
    const isCurrent = i === 0
    const currentLabel = isCurrent ? ' (Current)' : ''

    const daysAgo = Math.floor(
      (new Date().getTime() - new Date(v.created_at).getTime()) / (1000 * 3600 * 24)
    )
    let timeLabel: string
    if (daysAgo === 0) {
      timeLabel = 'Today'
    } else if (i === sortedVersions.length - 1) {
      timeLabel = `Created ${daysAgo} days ago`
    } else {
      timeLabel = `Updated ${daysAgo} days ago`
    }

    logger.info(`  - ${chalk.cyan('v' + v.version)}${currentLabel} - ${timeLabel}`)
  }

  logger.blank()
}

async function showVersionDiff(
  userId: string,
  promptName: string,
  targetVersion: string
): Promise<void> {
  const { data: prompt, error: promptError } = await supabase
    .from('prompts')
    .select('id')
    .eq('owner_id', userId)
    .eq('name', promptName)
    .eq('status', 'active')
    .maybeSingle()

  if (promptError) {
    throw new Error(`Could not fetch prompt: ${promptError.message}`)
  }

  if (!prompt) {
    logger.error(`Prompt not found: ${promptName}`)
    return
  }

  const { data: versions, error: versionsError } = await supabase
    .from('prompt_versions')
    .select('version')
    .eq('prompt_id', prompt.id)
    .is('deleted_at', null)

  if (versionsError) {
    throw new Error(`Could not fetch prompt versions: ${versionsError.message}`)
  }

  const sortedVersions = (versions ?? []).map((v) => v.version).sort((a, b) => compareSemver(a, b))

  const targetIndex = sortedVersions.indexOf(targetVersion)

  if (targetIndex === -1) {
    logger.error(`Version ${targetVersion} not found for prompt ${promptName}.`)
    return
  }

  let previousVersion: string | null = null
  if (targetIndex > 0) {
    previousVersion = sortedVersions[targetIndex - 1]
  }

  const targetContent = await getPromptContentByVersion(prompt.id, targetVersion)
  const previousContent = previousVersion
    ? await getPromptContentByVersion(prompt.id, previousVersion)
    : ''

  logger.info(`\n${chalk.bold.cyan(`${promptName}@${targetVersion}`)}`)
  if (previousVersion) {
    logger.info(`(Compared to previous version v${previousVersion})\n`)
  } else {
    logger.info(`(Initial version)\n`)
  }

  const diff = diffLines(previousContent, targetContent)

  for (const part of diff) {
    if (!part.value) continue

    const lines = part.value.replace(/\n$/, '').split('\n')
    for (const line of lines) {
      if (part.added) {
        logger.success(`+${line}`, false)
      } else if (part.removed) {
        logger.error(`-${line}`)
      } else {
        logger.info(chalk.gray(` ${line}`))
      }
    }
  }
  logger.blank()
}

async function listUserPublicPrompts(username: string): Promise<void> {
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', username)
    .maybeSingle()

  if (profileError) {
    throw new Error(`Could not fetch user: ${profileError.message}`)
  }

  if (!profile) {
    logger.error(`User not found: @${username}`)
    return
  }

  const { data, error } = await supabase
    .from('prompts')
    .select('name, current_version, description')
    .eq('owner_id', profile.id)
    .eq('visibility', 'public')
    .eq('status', 'active')
    .order('name')

  if (error) {
    throw new Error(`Could not fetch prompts: ${error.message}`)
  }

  const prompts = data ?? []

  if (prompts.length === 0) {
    logger.warn(`@${username} has no public prompts.`)
    return
  }

  logger.info(`\n@${username}'s Public Prompts [${prompts.length}]\n`)

  prompts.forEach((prompt, index) => {
    logger.info(chalk.bold(`${index + 1}. ${prompt.name}`))

    if (prompt.description) {
      logger.info(chalk.gray(`   ${prompt.description}`))
    } else {
      logger.info(chalk.gray(`   No description`))
    }

    logger.info(chalk.gray(`   Version: v${prompt.current_version}`))
    logger.info(chalk.gray(`   Get: prompt-it get ${username}/${prompt.name}`))
    logger.blank()
  })
}
