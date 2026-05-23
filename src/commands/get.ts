import path from 'node:path'
import process from 'node:process'
import chalk from 'chalk'
import fs from 'fs-extra'
import clipboard from 'clipboardy'
import { select, confirm, isCancel, cancel, outro } from '@clack/prompts'
import type { Command } from 'commander'

import { parsePromptRef } from '../utils/promptRef.js'
import {
  getPromptContent,
  getPromptMetadata,
  type PromptMetadata
} from '../services/registry.js'

type GetCommandOptions = {
  copy?: boolean
  file?: boolean
}

type PromptAction = 'copy' | 'file' | 'skill'

export function registerGetCommand(program: Command): void {
  program
    .command('get')
    .description('Get a prompt from the Prompt-it registry.')
    .argument('<promptRef>', 'Prompt reference. Example: prompt-it/test')
    .option('--copy', 'Copy prompt content directly to clipboard.')
    .option('--file', 'Create a markdown file with the prompt content.')
    .action(async (promptRef: string, options: GetCommandOptions) => {
      try {
        const { user, promptName } = parsePromptRef(promptRef)

        const [content, metadata] = await Promise.all([
          getPromptContent(user, promptName),
          getPromptMetadata(user, promptName)
        ])

        if (options.copy && options.file) {
          console.log(
            chalk.red('Use only one option at a time: --copy or --file.')
          )
          return
        }

        if (options.copy) {
          await copyPromptToClipboard(content, metadata)
          return
        }

        if (options.file) {
          await createPromptFile(content, promptName)
          return
        }

        await showPromptAndAskAction(content, metadata, promptName)
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unexpected error occurred.'

        console.log(chalk.red(`Error: ${message}`))
      }
    })
}

async function showPromptAndAskAction(
  content: string,
  metadata: PromptMetadata,
  promptName: string
): Promise<void> {
  console.log('')
  console.log(chalk.cyan(`# ${metadata.title || promptName}`))
  console.log(chalk.gray(`Author: ${metadata.author || 'unknown'}`))
  console.log('')
  console.log(content)
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
    await copyPromptToClipboard(content, metadata)
    return
  }

  if (action === 'file') {
    await createPromptFile(content, promptName)
    return
  }

  if (action === 'skill') {
    outro('Skill integration is coming soon.')
    return
  }
}

async function copyPromptToClipboard(
  content: string,
  metadata: PromptMetadata
): Promise<void> {
  await clipboard.write(content)

  console.log(
    chalk.green(
      `Copied "${metadata.title || metadata.name || 'prompt'}" to clipboard.`
    )
  )
}

async function createPromptFile(
  content: string,
  promptName: string
): Promise<void> {
  const fileName = `${promptName}.md`
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

  await fs.writeFile(filePath, content, 'utf8')

  console.log(chalk.green(`Created file: ${fileName}`))
}