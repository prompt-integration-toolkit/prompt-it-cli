import path from 'node:path'
import process from 'node:process'
import chalk from 'chalk'
import fs from 'fs-extra'
import clipboard from 'clipboardy'
import { select, confirm, isCancel, cancel, outro } from '@clack/prompts'
import type { Command } from 'commander'

import { supabase } from '../services/supabase.js'
import { getSession } from '../services/session.js'
import { parsePromptRef } from '../utils/promptRef.js'

type GetCommandOptions = {
  copy?: boolean
  file?: boolean
}

type PromptAction = 'copy' | 'file' | 'skill'

type SupabasePrompt = {
  id: string
  owner_id: string
  name: string
  title: string
  description: string
  username: string
  current_content: string
  current_version: string
  tags: string[]
}

export function registerGetCommand(program: Command): void {
  program
    .command('get')
    .description('Get a prompt from Prompt-it.')
    .argument('<promptRef>', 'Prompt reference. Example: miguel/test')
    .argument('[action]', 'Optional action. Use "details" to create prompt-details.json.')
    .option('--copy', 'Copy prompt content directly to clipboard.')
    .option('--file', 'Create a markdown file with the prompt content.')
    .action(
      async (
        promptRef: string,
        action: string | undefined,
        options: GetCommandOptions
      ) => {
        try {
          const { user, promptName } = parsePromptRef(promptRef)

          if (action && action !== 'details') {
            console.log(chalk.red(`Unknown get action: ${action}`))
            console.log(chalk.gray('Available action: details'))
            return
          }

          const prompt = await getPromptFromSupabase(user, promptName)

          if (!prompt) {
            console.log(chalk.red(`Prompt not found: ${user}/${promptName}`))
            return
          }

          if (options.copy && options.file) {
            console.log(
              chalk.red('Use only one option at a time: --copy or --file.')
            )
            return
          }

          if (action === 'details') {
            await createPromptDetailsFile(prompt)
            return
          }

          if (options.copy) {
            await copyPromptToClipboard(prompt)
            return
          }

          if (options.file) {
            await createPromptFile(prompt)
            return
          }

          const isOwner = await checkIsPromptOwner(prompt)

          await showPromptAndAskAction(prompt, isOwner)
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Unexpected error occurred.'

          console.log(chalk.red(`Error: ${message}`))
        }
      }
    )
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
    .maybeSingle()

  if (error) {
    throw new Error(`Could not fetch prompt: ${error.message}`)
  }

  return data
}

async function checkIsPromptOwner(prompt: SupabasePrompt): Promise<boolean> {
  const session = await getSession()

  if (!session) {
    return false
  }

  return session.user.id === prompt.owner_id
}

async function showPromptAndAskAction(
  prompt: SupabasePrompt,
  isOwner: boolean
): Promise<void> {
  console.log('')
  console.log(chalk.cyan(`# ${prompt.title || prompt.name}`))
  console.log(chalk.gray(`Author: ${prompt.username}`))
  console.log(chalk.gray(`Version: ${prompt.current_version}`))
  console.log('')
  console.log(prompt.current_content)
  console.log('')

  const action = await select<PromptAction>({
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

  if (isCancel(action)) {
    cancel('Operation cancelled.')
    return
  }

  if (action === 'copy') {
    await copyPromptToClipboard(prompt)
  }

  if (action === 'file') {
    await createPromptFile(prompt)
  }

  if (action === 'skill') {
    outro('Skill integration is coming soon.')
  }

  if (isOwner) {
    await askToCreatePromptDetailsFile(prompt)
  }
}

async function askToCreatePromptDetailsFile(
  prompt: SupabasePrompt
): Promise<void> {
  const shouldCreateDetails = await confirm({
    message: 'Get prompt-details.json?',
    initialValue: false
  })

  if (isCancel(shouldCreateDetails) || shouldCreateDetails === false) {
    return
  }

  await createPromptDetailsFile(prompt)
}

async function copyPromptToClipboard(prompt: SupabasePrompt): Promise<void> {
  await clipboard.write(prompt.current_content)

  console.log(chalk.green(`Copied "${prompt.title || prompt.name}" to clipboard.`))
}

async function createPromptFile(prompt: SupabasePrompt): Promise<void> {
  const fileName = `${prompt.name}.md`
  const filePath = path.join(process.cwd(), fileName)

  const exists = await fs.pathExists(filePath)

  if (exists) {
    const shouldOverwrite = await confirm({
      message: `${fileName} already exists. Overwrite?`,
      initialValue: false
    })

    if (isCancel(shouldOverwrite) || shouldOverwrite === false) {
      cancel('File creation cancelled.')
      return
    }
  }

  await fs.writeFile(filePath, prompt.current_content, 'utf8')

  console.log(chalk.green(`Created file: ${fileName}`))
}

async function createPromptDetailsFile(prompt: SupabasePrompt): Promise<void> {
  const fileName = 'prompt-details.json'
  const filePath = path.join(process.cwd(), fileName)

  const exists = await fs.pathExists(filePath)

  if (exists) {
    const shouldOverwrite = await confirm({
      message: `${fileName} already exists. Overwrite?`,
      initialValue: false
    })

    if (isCancel(shouldOverwrite) || shouldOverwrite === false) {
      cancel('prompt-details.json creation cancelled.')
      return
    }
  }

  const details = {
    'prompt-file': `${prompt.name}.md`,
    name: prompt.name,
    title: prompt.title,
    description: prompt.description,
    version: prompt.current_version,
    tags: prompt.tags ?? []
  }

  await fs.writeJson(filePath, details, {
    spaces: 2
  })

  console.log(chalk.green(`Created file: ${fileName}`))
}