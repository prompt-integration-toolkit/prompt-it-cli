import logger from '../utils/logger.js'
import path from 'node:path'
import process from 'node:process'
import chalk from 'chalk'
import fs from 'fs-extra'
import { confirm, isCancel, cancel, outro } from '@clack/prompts'
import type { Command } from 'commander'

type PromptDetailsTemplate = {
  'prompt-file': string
  name: string
  title: string
  description: string
  version: string
  tags: string[]
}

const PROMPT_DETAILS_FILE = 'prompt-details.json'

const promptDetailsTemplate: PromptDetailsTemplate = {
  'prompt-file': 'EXAMPLE.md',
  name: 'your-prompt-name',
  title: 'Your Prompt Title',
  description: 'What is the purpose of your prompt?',
  version: '1.0.0',
  tags: ['example_tag1', 'example_tag2']
}

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Create a prompt-details.json template in the current directory.')
    .action(async () => {
      try {
        const filePath = path.join(process.cwd(), PROMPT_DETAILS_FILE)
        const exists = await fs.pathExists(filePath)

        if (exists) {
          const shouldOverwrite = await confirm({
            message: `${PROMPT_DETAILS_FILE} already exists. Overwrite?`,
            initialValue: false
          })

          if (isCancel(shouldOverwrite) || shouldOverwrite === false) {
            cancel('Init cancelled.')
            return
          }
        }

        await fs.writeJson(filePath, promptDetailsTemplate, {
          spaces: 2
        })

        logger.success(`${PROMPT_DETAILS_FILE} created successfully.`, true)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unexpected error occurred.'

        logger.error(`Error: ${message}`)
      }
    })
}
