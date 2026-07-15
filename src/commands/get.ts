import logger from '../utils/logger.js'
import path from 'node:path'
import process from 'node:process'
import chalk from 'chalk'
import fs from 'fs-extra'
import clipboard from 'clipboardy'
import { promptSelect, promptConfirm } from '../utils/prompts.js'
import type { Command } from 'commander'

import { supabase } from '../services/supabase.js'
import { getSession } from '../services/session.js'
import { parsePromptRef } from '../utils/promptRef.js'

type GetCommandOptions = {
  copy?: boolean
  file?: boolean
}

type PromptAction = 'copy' | 'file' | 'skill'

import { SupabasePrompt, ResolvedPrompt, resolvePromptVersion } from '../utils/promptResolver.js'

export function registerGetCommand(program: Command): void {
  program
    .command('get')
    .description('Get a prompt from Prompt-it.')
    .argument('<promptRef>', 'Prompt reference. Example: miguel/test or miguel/test@1.0.1')
    .argument('[action]', 'Optional action. Use "details" to create prompt-details.json.')
    .option('--copy', 'Copy prompt content directly to clipboard.')
    .option('--file', 'Create a markdown file with the prompt content.')
    .action(async (promptRef: string, action: string | undefined, options: GetCommandOptions) => {
      try {
        const { user, promptName, version } = parsePromptRef(promptRef)

        if (action && action !== 'details') {
          logger.error(`Unknown get action: ${action}`)
          logger.info(chalk.gray('Available action: details'))
          return
        }

        const prompt = await getPromptFromSupabase(user, promptName)

        if (!prompt) {
          logger.error(`Prompt not found: ${user}/${promptName}`)
          return
        }

        const resolvedPrompt = await resolvePromptVersion(prompt, version)

        if (options.copy && options.file) {
          logger.error('Use only one option at a time: --copy or --file.')
          return
        }

        if (action === 'details') {
          await createPromptDetailsFile(resolvedPrompt)
          return
        }

        if (options.copy) {
          await copyPromptToClipboard(resolvedPrompt)
          return
        }

        if (options.file) {
          await createPromptFile(resolvedPrompt)
          return
        }

        const isOwner = await checkIsPromptOwner(resolvedPrompt)

        await showPromptAndAskAction(resolvedPrompt, isOwner)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unexpected error occurred.'

        logger.error(`Error: ${message}`)
      }
    })
}

async function getPromptFromSupabase(
  username: string,
  promptName: string
): Promise<SupabasePrompt | null> {
  const { data, error } = await supabase
    .from('prompts')
    .select(
      'id, owner_id, name, title, description, username, current_content, current_version, tags'
    )
    .eq('username', username)
    .eq('name', promptName)
    .eq('visibility', 'public')
    .eq('status', 'active')
    .maybeSingle()

  if (error) {
    throw new Error(`Could not fetch prompt: ${error.message}`)
  }

  return data
}

async function checkIsPromptOwner(prompt: ResolvedPrompt): Promise<boolean> {
  const session = await getSession()

  if (!session) {
    return false
  }

  return session.user.id === prompt.owner_id
}

async function showPromptAndAskAction(prompt: ResolvedPrompt, isOwner: boolean): Promise<void> {
  logger.blank()
  logger.header(`# ${prompt.title || prompt.name}`)
  logger.info(chalk.gray(`Author: ${prompt.username}`))
  logger.info(chalk.gray(`Version: ${prompt.resolved_version}`))

  if (prompt.is_historical_version) {
    logger.info(chalk.gray(`Latest version: ${prompt.current_version}`))
  }

  logger.blank()
  logger.info(prompt.resolved_content)
  logger.blank()

  const action = await promptSelect<PromptAction>({
    message: 'What do you want to do with this prompt?',
    options: [
      {
        value: 'copy',
        label: 'Copy to clipboard'
      },
      {
        value: 'file',
        label: 'Get MD File'
      },
      {
        value: 'skill',
        label: 'Set as skill, for context, to agent'
      }
    ]
  })

  if (action === 'copy') {
    await copyPromptToClipboard(prompt)
  }

  if (action === 'file') {
    await createPromptFile(prompt)
  }

  if (action === 'skill') {
    logger.info('Skill integration is coming soon.')
  }

  if (isOwner) {
    await askToCreatePromptDetailsFile(prompt)
  }
}

async function askToCreatePromptDetailsFile(prompt: ResolvedPrompt): Promise<void> {
  const shouldCreateDetails = await promptConfirm({
    message: 'Get prompt-details.json?',
    initialValue: false
  })

  if (!shouldCreateDetails) {
    return
  }

  await createPromptDetailsFile(prompt)
}

async function copyPromptToClipboard(prompt: ResolvedPrompt): Promise<void> {
  await clipboard.write(prompt.resolved_content)

  logger.success(`Copied "${prompt.title || prompt.name}" to clipboard.`, false)
}

async function createPromptFile(prompt: ResolvedPrompt): Promise<void> {
  const fileName = prompt.is_historical_version
    ? `${prompt.name}@${prompt.resolved_version}.md`
    : `${prompt.name}.md`

  const filePath = path.join(process.cwd(), fileName)

  const exists = await fs.pathExists(filePath)

  if (exists) {
    const shouldOverwrite = await promptConfirm({
      message: `${fileName} already exists. Overwrite?`,
      initialValue: false
    })

    if (!shouldOverwrite) {
      return
    }
  }

  await fs.writeFile(filePath, prompt.resolved_content, 'utf8')

  logger.success(`Created file: ${fileName}`, false)
}

async function createPromptDetailsFile(prompt: ResolvedPrompt): Promise<void> {
  const fileName = 'prompt-details.json'
  const filePath = path.join(process.cwd(), fileName)

  const exists = await fs.pathExists(filePath)

  if (exists) {
    const shouldOverwrite = await promptConfirm({
      message: `${fileName} already exists. Overwrite?`,
      initialValue: false
    })

    if (!shouldOverwrite) {
      return
    }
  }

  const details = {
    'prompt-file': `${prompt.name}.md`,
    name: prompt.name,
    title: prompt.title,
    description: prompt.description,
    version: prompt.resolved_version,
    tags: prompt.tags ?? []
  }

  await fs.writeJson(filePath, details, {
    spaces: 2
  })

  logger.success(`Created file: ${fileName}`, false)
}
