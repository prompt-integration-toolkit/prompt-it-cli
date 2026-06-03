import path from 'node:path'
import process from 'node:process'
import chalk from 'chalk'
import fs from 'fs-extra'
import clipboard from 'clipboardy'
import { applyPatch } from 'diff'
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

type PromptVersionRecord = {
  version: string
  base_version: string | null
  change_type: 'snapshot' | 'diff'
  diff: string | null
  snapshot_content: string | null
  created_at: string
}

type ResolvedPrompt = SupabasePrompt & {
  resolved_content: string
  resolved_version: string
  is_historical_version: boolean
}

type Semver = {
  major: number
  minor: number
  patch: number
}

export function registerGetCommand(program: Command): void {
  program
    .command('get')
    .description('Get a prompt from Prompt-it.')
    .argument('<promptRef>', 'Prompt reference. Example: miguel/test or miguel/test@1.0.1')
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
          const { user, promptName, version } = parsePromptRef(promptRef)

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

          const resolvedPrompt = await resolvePromptVersion(prompt, version)

          if (options.copy && options.file) {
            console.log(
              chalk.red('Use only one option at a time: --copy or --file.')
            )
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
    .eq('status', 'active')
    .maybeSingle()

  if (error) {
    throw new Error(`Could not fetch prompt: ${error.message}`)
  }

  return data
}

async function resolvePromptVersion(
  prompt: SupabasePrompt,
  requestedVersion?: string
): Promise<ResolvedPrompt> {
  if (!requestedVersion || requestedVersion === prompt.current_version) {
    return {
      ...prompt,
      resolved_content: prompt.current_content,
      resolved_version: prompt.current_version,
      is_historical_version: false
    }
  }

  const versionContent = await getPromptContentByVersion(
    prompt.id,
    requestedVersion
  )

  return {
    ...prompt,
    resolved_content: versionContent,
    resolved_version: requestedVersion,
    is_historical_version: true
  }
}

async function getPromptContentByVersion(
  promptId: string,
  requestedVersion: string
): Promise<string> {
  const { data, error } = await supabase
    .from('prompt_versions')
    .select('version, base_version, change_type, diff, snapshot_content, created_at')
    .eq('prompt_id', promptId)

  if (error) {
    throw new Error(`Could not fetch prompt versions: ${error.message}`)
  }

  const versions = (data ?? []) as PromptVersionRecord[]

  if (versions.length === 0) {
    throw new Error('No version history found for this prompt.')
  }

  const requestedVersionRecord = versions.find(
    version => version.version === requestedVersion
  )

  if (!requestedVersionRecord) {
    throw new Error(`Version not found: ${requestedVersion}`)
  }

  if (
    requestedVersionRecord.change_type === 'snapshot' &&
    requestedVersionRecord.snapshot_content
  ) {
    return requestedVersionRecord.snapshot_content
  }

  const sortedVersions = versions
    .filter(version => compareSemver(version.version, requestedVersion) <= 0)
    .sort((a, b) => compareSemver(a.version, b.version))

  const requestedIndex = sortedVersions.findIndex(
    version => version.version === requestedVersion
  )

  if (requestedIndex === -1) {
    throw new Error(`Version not found: ${requestedVersion}`)
  }

  let snapshotIndex = -1

  for (let index = requestedIndex; index >= 0; index--) {
    const version = sortedVersions[index]

    if (version.change_type === 'snapshot' && version.snapshot_content) {
      snapshotIndex = index
      break
    }
  }

  if (snapshotIndex === -1) {
    throw new Error(
      `Could not reconstruct version ${requestedVersion}. No snapshot found before it.`
    )
  }

  let content = sortedVersions[snapshotIndex].snapshot_content

  if (!content) {
    throw new Error(
      `Could not reconstruct version ${requestedVersion}. Snapshot content is missing.`
    )
  }

  for (let index = snapshotIndex + 1; index <= requestedIndex; index++) {
    const version = sortedVersions[index]

    if (version.change_type === 'snapshot') {
      if (!version.snapshot_content) {
        throw new Error(`Snapshot content is missing for version ${version.version}.`)
      }

      content = version.snapshot_content
      continue
    }

    if (!version.diff) {
      throw new Error(`Diff content is missing for version ${version.version}.`)
    }

    const patchedContent = applyPatch(content, version.diff)

    if (patchedContent === false) {
      throw new Error(`Could not apply diff for version ${version.version}.`)
    }

    content = patchedContent
  }

  return content
}

async function checkIsPromptOwner(prompt: ResolvedPrompt): Promise<boolean> {
  const session = await getSession()

  if (!session) {
    return false
  }

  return session.user.id === prompt.owner_id
}

async function showPromptAndAskAction(
  prompt: ResolvedPrompt,
  isOwner: boolean
): Promise<void> {
  console.log('')
  console.log(chalk.cyan(`# ${prompt.title || prompt.name}`))
  console.log(chalk.gray(`Author: ${prompt.username}`))
  console.log(chalk.gray(`Version: ${prompt.resolved_version}`))

  if (prompt.is_historical_version) {
    console.log(chalk.gray(`Latest version: ${prompt.current_version}`))
  }

  console.log('')
  console.log(prompt.resolved_content)
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
  prompt: ResolvedPrompt
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

async function copyPromptToClipboard(prompt: ResolvedPrompt): Promise<void> {
  await clipboard.write(prompt.resolved_content)

  console.log(chalk.green(`Copied "${prompt.title || prompt.name}" to clipboard.`))
}

async function createPromptFile(prompt: ResolvedPrompt): Promise<void> {
  const fileName =
    prompt.is_historical_version
      ? `${prompt.name}@${prompt.resolved_version}.md`
      : `${prompt.name}.md`

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

  await fs.writeFile(filePath, prompt.resolved_content, 'utf8')

  console.log(chalk.green(`Created file: ${fileName}`))
}

async function createPromptDetailsFile(prompt: ResolvedPrompt): Promise<void> {
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
    version: prompt.resolved_version,
    tags: prompt.tags ?? []
  }

  await fs.writeJson(filePath, details, {
    spaces: 2
  })

  console.log(chalk.green(`Created file: ${fileName}`))
}

function compareSemver(a: string, b: string): number {
  const versionA = parseSemver(a)
  const versionB = parseSemver(b)

  if (!versionA || !versionB) {
    throw new Error('Invalid semantic version found in version history.')
  }

  if (versionA.major !== versionB.major) {
    return versionA.major - versionB.major
  }

  if (versionA.minor !== versionB.minor) {
    return versionA.minor - versionB.minor
  }

  return versionA.patch - versionB.patch
}

function parseSemver(version: string): Semver | null {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/)

  if (!match) {
    return null
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3])
  }
}