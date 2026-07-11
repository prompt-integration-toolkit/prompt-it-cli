import path from 'node:path'
import process from 'node:process'
import chalk from 'chalk'
import fs from 'fs-extra'
import { createTwoFilesPatch } from 'diff'
import { confirm, isCancel, cancel, outro } from '@clack/prompts'
import type { Command } from 'commander'

import { supabase } from '../services/supabase.js'
import { getSession } from '../services/session.js'
import { getProfileFromSession } from '../services/profile.js'
import { readPromptDetails, normalizeTags } from '../utils/promptDetails.js'
import { assertWithinPostLimit } from '../services/limits.js'
import { moderateContent } from '../services/moderation.js'
import { isValidSemver, isVersionGreater, getChangeType } from '../utils/semver.js'
import { isValidPromptName } from '../utils/validators.js'

type PublishOptions = {
  name?: string
  title?: string
  description?: string
  tags?: string
}

type PromptRecord = {
  id: string
  owner_id: string
  username: string
  name: string
  title: string
  description: string
  current_content: string
  current_version: string
  tags: string[]
}

export function registerPublishCommand(program: Command): void {
  const publishCommand = program
    .command('publish')
    .description('Publish a prompt to Prompt-it.')
    .argument('[promptFile]', 'Markdown prompt file.')
    .option('--name <name>', 'Prompt name.')
    .option('--title <title>', 'Prompt title.')
    .option('--description <description>', 'Prompt description.')
    .option('--tags <tags>', 'Comma separated tags. Example: code,review,ai')
    .action(async (promptFileArg: string | undefined, options: PublishOptions) => {
      await handleInitialPublish(promptFileArg, options)
    })

  publishCommand
    .command('update')
    .description('Update an existing published prompt.')
    .argument('[promptFile]', 'Markdown prompt file.')
    .option('--name <name>', 'Prompt name.')
    .option('--title <title>', 'Prompt title.')
    .option('--description <description>', 'Prompt description.')
    .option('--tags <tags>', 'Comma separated tags. Example: code,review,ai')
    .option('--message <message>', 'Update message.')
    .action(
      async (promptFileArg: string | undefined, options: PublishOptions & { message?: string }) => {
        await handlePublishUpdate(promptFileArg, options)
      }
    )
}

async function handleInitialPublish(
  promptFileArg: string | undefined,
  options: PublishOptions
): Promise<void> {
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
    const tags = options.tags ? normalizeTags(options.tags) : normalizeTags(details?.tags)

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
        chalk.red('Invalid prompt name. Use only letters, numbers, hyphen or underscore.')
      )
      return
    }

    if (!isValidSemver(version)) {
      console.log(chalk.red('Invalid version. Use format like 1.0.0.'))
      return
    }

    const promptContent = await readPromptFile(promptFile)

    try {
      await moderateContent(promptContent)
    } catch (modError: any) {
      if (modError.message === 'NO_API_KEY' || modError.message === 'API_ERROR') {
        console.log(chalk.red('\nCurrently, it\'s not possible to publish or update because the moderation service is unavailable. Please wait a moment and try again.'))
        return
      }
      if (modError.message.startsWith('MODERATION_FAILED:')) {
        const categories = modError.message.split(':')[1]
        console.log(chalk.red(`\nContent blocked for violating safety policies. Identified categories: [${categories}]`))
        return
      }
      throw modError
    }

    const existingPrompt = await findExistingPrompt(profile.username, name)

    if (existingPrompt) {
      console.log(chalk.red(`Prompt already exists: ${profile.username}/${name}`))
      console.log(chalk.gray('Use: prompt-it publish update'))
      return
    }

    await assertWithinPostLimit(profile.id)

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

    const { error: versionError } = await supabase.from('prompt_versions').insert({
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
    const message = error instanceof Error ? error.message : 'Unexpected error occurred.'

    console.log(chalk.red(`Error: ${message}`))
  }
}

async function handlePublishUpdate(
  promptFileArg: string | undefined,
  options: PublishOptions & { message?: string }
): Promise<void> {
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
    const newVersion = details?.version
    const tags = options.tags ? normalizeTags(options.tags) : normalizeTags(details?.tags)

    if (!name || !title || !description || !newVersion) {
      console.log(chalk.red('Missing prompt details.'))
      console.log(
        chalk.gray(
          'Required fields: name, title, description, version. Use prompt-details.json or command flags.'
        )
      )
      return
    }

    if (!isValidPromptName(name)) {
      console.log(
        chalk.red('Invalid prompt name. Use only letters, numbers, hyphen or underscore.')
      )
      return
    }

    if (!isValidSemver(newVersion)) {
      console.log(chalk.red('Invalid version. Use format like 1.0.0.'))
      return
    }

    const existingPrompt = await findExistingPrompt(profile.username, name)

    if (!existingPrompt) {
      console.log(chalk.red(`Prompt not found: ${profile.username}/${name}`))
      console.log(chalk.gray('Use prompt-it publish first.'))
      return
    }

    if (existingPrompt.owner_id !== profile.id) {
      console.log(chalk.red('You cannot update a prompt that you do not own.'))
      return
    }

    if (!isVersionGreater(newVersion, existingPrompt.current_version)) {
      console.log(
        chalk.red(
          `New version must be greater than current version ${existingPrompt.current_version}.`
        )
      )
      return
    }

    await assertWithinPostLimit(profile.id)

    const newContent = await readPromptFile(promptFile)

    try {
      await moderateContent(newContent)
    } catch (modError: any) {
      if (modError.message === 'NO_API_KEY' || modError.message === 'API_ERROR') {
        console.log(chalk.red('\nCurrently, it\'s not possible to publish or update because the moderation service is unavailable. Please wait a moment and try again.'))
        return
      }
      if (modError.message.startsWith('MODERATION_FAILED:')) {
        const categories = modError.message.split(':')[1]
        console.log(chalk.red(`\nContent blocked for violating safety policies. Identified categories: [${categories}]`))
        return
      }
      throw modError
    }

    if (newContent === existingPrompt.current_content) {
      console.log(chalk.yellow('No content changes detected.'))
      return
    }

    const changeType = getChangeType(existingPrompt.current_version, newVersion)

    const generatedDiff =
      changeType === 'diff'
        ? createPromptDiff({
            name,
            oldVersion: existingPrompt.current_version,
            newVersion,
            oldContent: existingPrompt.current_content,
            newContent
          })
        : null

    const snapshotContent = changeType === 'snapshot' ? newContent : null
    const updateMessage = options.message || `Update to ${newVersion}`

    console.log('')
    console.log(chalk.cyan('Update summary'))
    console.log(chalk.gray('--------------'))
    console.log(`${chalk.bold('Prompt:')} ${profile.username}/${name}`)
    console.log(`${chalk.bold('Current version:')} ${existingPrompt.current_version}`)
    console.log(`${chalk.bold('New version:')} ${newVersion}`)
    console.log(`${chalk.bold('Change type:')} ${changeType}`)
    console.log(`${chalk.bold('Title:')} ${title}`)
    console.log(`${chalk.bold('Description:')} ${description}`)
    console.log(`${chalk.bold('Tags:')} ${tags.join(', ') || 'none'}`)
    console.log(`${chalk.bold('Message:')} ${updateMessage}`)
    console.log('')

    const shouldUpdate = await confirm({
      message: 'Update prompt?',
      initialValue: true
    })

    if (isCancel(shouldUpdate) || shouldUpdate === false) {
      cancel('Update cancelled.')
      return
    }

    const { error: versionError } = await supabase.from('prompt_versions').insert({
      prompt_id: existingPrompt.id,
      version: newVersion,
      base_version: existingPrompt.current_version,
      change_type: changeType,
      diff: generatedDiff,
      snapshot_content: snapshotContent,
      message: updateMessage
    })

    if (versionError) {
      console.log(chalk.red(`Version error: ${versionError.message}`))
      return
    }

    const { error: updateError } = await supabase
      .from('prompts')
      .update({
        title,
        description,
        current_content: newContent,
        current_version: newVersion,
        tags,
        updated_at: new Date().toISOString()
      })
      .eq('id', existingPrompt.id)

    if (updateError) {
      console.log(chalk.red(`Update error: ${updateError.message}`))
      return
    }

    outro(chalk.green(`Prompt updated successfully: ${profile.username}/${name} → ${newVersion}`))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error occurred.'

    console.log(chalk.red(`Error: ${message}`))
  }
}

async function findExistingPrompt(username: string, name: string): Promise<PromptRecord | null> {
  const { data, error } = await supabase
    .from('prompts')
    .select(
      'id, owner_id, username, name, title, description, current_content, current_version, tags'
    )
    .eq('username', username)
    .eq('name', name)
    .maybeSingle()

  if (error) {
    throw new Error(`Could not check existing prompt: ${error.message}`)
  }

  return data
}

async function readPromptFile(promptFile: string): Promise<string> {
  const promptFilePath = path.join(process.cwd(), String(promptFile))
  const promptFileExists = await fs.pathExists(promptFilePath)

  if (!promptFileExists) {
    throw new Error(`Prompt file not found: ${promptFile}`)
  }

  const promptContent = await fs.readFile(promptFilePath, 'utf8')

  if (!promptContent.trim()) {
    throw new Error('Prompt file is empty.')
  }

  return promptContent
}

function createPromptDiff(params: {
  name: string
  oldVersion: string
  newVersion: string
  oldContent: string
  newContent: string
}): string {
  return createTwoFilesPatch(
    `${params.name}@${params.oldVersion}.md`,
    `${params.name}@${params.newVersion}.md`,
    params.oldContent,
    params.newContent,
    '',
    ''
  )
}


