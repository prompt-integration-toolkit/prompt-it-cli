import path from 'node:path'
import process from 'node:process'
import chalk from 'chalk'
import fs from 'fs-extra'
import { confirm, isCancel, cancel, outro } from '@clack/prompts'
import type { Command } from 'commander'

import { supabase } from '../services/supabase.js'
import { getSession } from '../services/session.js'
import { getProfileFromSession } from '../services/profile.js' 
import { readPromptDetails, normalizeTags } from '../utils/promptDetails.js'

type PublishOptions = {
  name?: string
  title?: string
  description?: string
  tags?: string
}

export function registerPublishCommand(program: Command): void {
  program
    .command('publish')
    .description('Publish a prompt to Prompt-it.')
    .argument('[promptFile]', 'Markdown prompt file.')
    .option('--name <name>', 'Prompt name.')
    .option('--title <title>', 'Prompt title.')
    .option('--description <description>', 'Prompt description.')
    .option('--tags <tags>', 'Comma separated tags. Example: code,review,ai')
    .action(async (promptFileArg: string | undefined, options: PublishOptions) => {
      try {
        const session = await getSession()

        if (!session) {
          console.log(chalk.yellow('You are not logged in.'))
          console.log(chalk.gray('Run: prompt-it login'))
          return
        }

        await supabase.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token
        })

        const profile = await getProfileFromSession(session)
        const details = await readPromptDetails()

        if (!details && !promptFileArg) {
          console.log(chalk.red('prompt-details.json not found.'))
          console.log(chalk.gray('Run: prompt-it init'))
          return
        }

        const promptFile = promptFileArg || details?.['prompt-file']

        if (!promptFile) {
          console.log(chalk.red('Prompt file is required.'))
          return
        }

        const name = options.name || details?.name
        const title = options.title || details?.title
        const description = options.description || details?.description
        const version = details?.version || '1.0.0'
        const tags = options.tags
          ? normalizeTags(options.tags)
          : normalizeTags(details?.tags)

        if (!name || !title || !description) {
          console.log(chalk.red('Missing prompt details.'))
          console.log(
            chalk.gray(
              'Required fields: name, title, description. Use prompt-details.json or command flags.'
            )
          )
          return
        }

        if (!isValidPromptName(name)) {
          console.log(
            chalk.red(
              'Invalid prompt name. Use only letters, numbers, hyphen or underscore.'
            )
          )
          return
        }

        if (!isValidSemver(version)) {
          console.log(chalk.red('Invalid version. Use format like 1.0.0.'))
          return
        }

        const promptFilePath = path.join(process.cwd(), String(promptFile))
        const promptFileExists = await fs.pathExists(promptFilePath)

        if (!promptFileExists) {
          console.log(chalk.red(`Prompt file not found: ${promptFile}`))
          return
        }

        const promptContent = await fs.readFile(promptFilePath, 'utf8')

        if (!promptContent.trim()) {
          console.log(chalk.red('Prompt file is empty.'))
          return
        }

        const existingPrompt = await findExistingPrompt(profile.username, name)

        if (existingPrompt) {
          console.log(chalk.red(`Prompt already exists: ${profile.username}/${name}`))
          console.log(chalk.gray('Use prompt-it publish update to update it.'))
          return
        }

        console.log('')
        console.log(chalk.cyan('Publish summary'))
        console.log(chalk.gray('---------------'))
        console.log(`${chalk.bold('Author:')} ${profile.username}`)
        console.log(`${chalk.bold('Name:')} ${name}`)
        console.log(`${chalk.bold('Title:')} ${title}`)
        console.log(`${chalk.bold('Description:')} ${description}`)
        console.log(`${chalk.bold('Version:')} ${version}`)
        console.log(`${chalk.bold('Tags:')} ${tags.join(', ') || 'none'}`)
        console.log('')

        const shouldPublish = await confirm({
          message: 'Publish prompt?',
          initialValue: true
        })

        if (isCancel(shouldPublish) || shouldPublish === false) {
          cancel('Publish cancelled.')
          return
        }

        const { data: promptData, error: promptError } = await supabase
          .from('prompts')
          .insert({
            owner_id: profile.id,
            username: profile.username,
            name,
            title,
            description,
            current_content: promptContent,
            current_version: version,
            tags,
            visibility: 'public'
          })
          .select('id')
          .single()

        if (promptError) {
          console.log(chalk.red(`Publish error: ${promptError.message}`))
          return
        }

        const { error: versionError } = await supabase
          .from('prompt_versions')
          .insert({
            prompt_id: promptData.id,
            version,
            base_version: null,
            change_type: 'snapshot',
            diff: null,
            snapshot_content: promptContent,
            message: 'Initial publish'
          })

        if (versionError) {
          console.log(chalk.red(`Version error: ${versionError.message}`))
          return
        }

        outro(chalk.green(`Prompt published successfully: ${profile.username}/${name}`))
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unexpected error occurred.'

        console.log(chalk.red(`Error: ${message}`))
      }
    })
}

async function findExistingPrompt(username: string, name: string) {
  const { data, error } = await supabase
    .from('prompts')
    .select('id')
    .eq('username', username)
    .eq('name', name)
    .maybeSingle()

  if (error) {
    throw new Error(`Could not check existing prompt: ${error.message}`)
  }

  return data
}

function isValidPromptName(name: string): boolean {
  return /^[a-zA-Z0-9_-]{3,60}$/.test(name)
}

function isValidSemver(version: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(version)
}