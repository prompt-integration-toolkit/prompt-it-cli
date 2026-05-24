import path from 'node:path'
import process from 'node:process'
import chalk from 'chalk'
import fs from 'fs-extra'
import {
  text,
  confirm,
  isCancel,
  cancel,
  outro
} from '@clack/prompts'
import type { Command } from 'commander'

import { getSession } from '../services/session.js'
import { getProfileFromSession } from '../services/profiles.js'
import {
  upsertGitHubFile,
  getGitHubTextFile
} from '../services/github.js'
import {
  readPromptDetails,
  normalizeTags,
  type PromptDetails
} from '../utils/promptDetails.js'
import { isValidUsername } from '../utils/validators.js'

type PublishOptions = {
  name?: string
  title?: string
  description?: string
  tags?: string
}

type PromptMetadata = {
  name: string
  title: string
  description: string
  author: string
  version: string
  tags: string[]
  visibility: 'public'
  createdAt: string
  updatedAt: string
  path: string
}

type UserRegistry = {
  owner: string
  prompts: {
    name: string
    title: string
    version: string
    description: string
    path: string
    metadata: string
  }[]
}

export function registerPublishCommand(program: Command): void {
  program
    .command('publish')
    .description('Publish a prompt to the Prompt-it registry.')
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

        const profile = await getProfileFromSession(session)

        if (!isValidUsername(profile.username)) {
          console.log(chalk.red('Invalid username in profile.'))
          return
        }

        const details = await readPromptDetails()

        const promptFile = await resolvePromptFile(promptFileArg, details)
        const name = await resolveTextValue({
          value: options.name || details?.name,
          message: 'Prompt name:'
        })

        if (isCancel(name)) {
          cancel('Publish cancelled.')
          return
        }

        const title = await resolveTextValue({
          value: options.title || details?.title,
          message: 'Prompt title:'
        })

        if (isCancel(title)) {
          cancel('Publish cancelled.')
          return
        }

        const description = await resolveTextValue({
          value: options.description || details?.description,
          message: 'Prompt description:'
        })

        if (isCancel(description)) {
          cancel('Publish cancelled.')
          return
        }

        const tags = options.tags
          ? normalizeTags(options.tags)
          : normalizeTags(details?.tags)

        const promptFilePath = path.join(process.cwd(), String(promptFile))
        const promptFileExists = await fs.pathExists(promptFilePath)

        if (!promptFileExists) {
          console.log(chalk.red(`Prompt file not found: ${promptFile}`))
          return
        }

        const promptContent = await fs.readFile(promptFilePath, 'utf8')

        const now = new Date().toISOString().split('T')[0]
        const promptName = String(name)

        const promptPath = `users/${profile.username}/${promptName}/prompt.md`
        const metadataPath = `users/${profile.username}/${promptName}/metadata.json`
        const registryPath = `users/${profile.username}/registry.json`

        const metadata: PromptMetadata = {
          name: promptName,
          title: String(title),
          description: String(description),
          author: profile.username,
          version: '1.0.0',
          tags,
          visibility: 'public',
          createdAt: now,
          updatedAt: now,
          path: promptPath
        }

        console.log('')
        console.log(chalk.cyan('Publish summary'))
        console.log(chalk.gray('---------------'))
        console.log(`${chalk.bold('Author:')} ${profile.username}`)
        console.log(`${chalk.bold('Name:')} ${metadata.name}`)
        console.log(`${chalk.bold('Title:')} ${metadata.title}`)
        console.log(`${chalk.bold('Description:')} ${metadata.description}`)
        console.log(`${chalk.bold('Tags:')} ${metadata.tags.join(', ') || 'none'}`)
        console.log(`${chalk.bold('Path:')} ${metadata.path}`)
        console.log('')

        const shouldPublish = await confirm({
          message: 'Publish this prompt?',
          initialValue: true
        })

        if (isCancel(shouldPublish) || shouldPublish === false) {
          cancel('Publish cancelled.')
          return
        }

        await upsertGitHubFile({
          path: promptPath,
          content: promptContent,
          message: `publish prompt ${profile.username}/${promptName}`
        })

        await upsertGitHubFile({
          path: metadataPath,
          content: JSON.stringify(metadata, null, 2),
          message: `publish metadata ${profile.username}/${promptName}`
        })

        const registry = await buildUpdatedUserRegistry({
          registryPath,
          owner: profile.username,
          metadata,
          metadataPath
        })

        await upsertGitHubFile({
          path: registryPath,
          content: JSON.stringify(registry, null, 2),
          message: `update registry ${profile.username}`
        })

        outro(chalk.green(`Published ${profile.username}/${promptName} successfully.`))
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unexpected error occurred.'

        console.log(chalk.red(`Error: ${message}`))
      }
    })
}

async function resolvePromptFile(
  promptFileArg: string | undefined,
  details: PromptDetails | null
): Promise<string> {
  if (promptFileArg) {
    return promptFileArg
  }

  if (details?.['prompt-file']) {
    return details['prompt-file']
  }

  const promptFile = await text({
    message: 'Prompt file:',
    placeholder: 'my-prompt.md',
    validate(value) {
      if (!value) return 'Prompt file is required.'
    }
  })

  if (isCancel(promptFile)) {
    throw new Error('Publish cancelled.')
  }

  return String(promptFile)
}

async function resolveTextValue(params: {
  value?: string
  message: string
}): Promise<string | symbol> {
  if (params.value && params.value.trim()) {
    return params.value.trim()
  }

  return text({
    message: params.message,
    validate(value) {
      if (!value) return 'This field is required.'
    }
  })
}

async function buildUpdatedUserRegistry(params: {
  registryPath: string
  owner: string
  metadata: PromptMetadata
  metadataPath: string
}): Promise<UserRegistry> {
  const currentRegistryText = await getGitHubTextFile(params.registryPath)

  const registry: UserRegistry = currentRegistryText
    ? JSON.parse(currentRegistryText)
    : {
        owner: params.owner,
        prompts: []
      }

  const nextPrompt = {
    name: params.metadata.name,
    title: params.metadata.title,
    version: params.metadata.version,
    description: params.metadata.description,
    path: params.metadata.path,
    metadata: params.metadataPath
  }

  const existingIndex = registry.prompts.findIndex(
    (prompt) => prompt.name === params.metadata.name
  )

  if (existingIndex >= 0) {
    registry.prompts[existingIndex] = nextPrompt
  } else {
    registry.prompts.push(nextPrompt)
  }

  return registry
}