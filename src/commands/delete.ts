import chalk from 'chalk'
import { text, isCancel, cancel, outro } from '@clack/prompts'
import type { Command } from 'commander'

import { supabase } from '../services/supabase.js'
import { getSession } from '../services/session.js'
import { getProfileFromSession, type UserProfile } from '../services/profile.js'
import { getPromptContentByVersion } from '../utils/promptResolver.js'

type PromptRecord = {
  id: string
  owner_id: string
  name: string
  current_version: string
}

type PromptVersionRecord = {
  id: string
  version: string
  change_type: 'snapshot' | 'diff'
  prompt_id: string
}

type Semver = {
  major: number
  minor: number
  patch: number
}

export function registerDeleteCommand(program: Command): void {
  program
    .command('delete <name>')
    .description('Delete a prompt you own, or a specific version (e.g. prompt-name@1.0.1)')
    .action(async (name: string) => {
      await handleDelete(name)
    })
}

async function handleDelete(inputName: string): Promise<void> {
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

    const hasVersion = inputName.includes('@')

    if (hasVersion) {
      const [promptName, targetVersion] = inputName.split('@')
      if (!promptName || !targetVersion) {
        console.log(chalk.red('Invalid format. Use prompt-name or prompt-name@version'))
        return
      }
      await handleDeleteVersion(profile, promptName, targetVersion)
    } else {
      await handleDeletePrompt(profile, inputName)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error occurred.'

    console.log(chalk.red(`Error: ${message}`))
  }
}

async function handleDeleteVersion(profile: UserProfile, name: string, version: string): Promise<void> {
  const prompt = await findActivePrompt(profile.username, name)

  if (!prompt) {
    console.log(chalk.red(`Prompt not found: ${profile.username}/${name}`))
    return
  }

  if (prompt.owner_id !== profile.id) {
    console.log(chalk.red('You do not own this prompt.'))
    return
  }

  const { data: versions, error } = await supabase
    .from('prompt_versions')
    .select('id, version, change_type, prompt_id')
    .eq('prompt_id', prompt.id)

  if (error) {
    console.log(chalk.red(`Could not fetch versions: ${error.message}`))
    return
  }

  const sortedVersions = (versions as PromptVersionRecord[]).sort((a, b) =>
    compareSemver(a.version, b.version)
  )

  const targetIndex = sortedVersions.findIndex((v) => v.version === version)
  if (targetIndex === -1) {
    console.log(chalk.red(`Version ${version} not found in prompt ${name}.`))
    return
  }

  const versionsToDelete: PromptVersionRecord[] = [sortedVersions[targetIndex]]

  for (let i = targetIndex + 1; i < sortedVersions.length; i++) {
    const v = sortedVersions[i]
    if (v.change_type === 'snapshot') {
      break
    }
    versionsToDelete.push(v)
  }

  const deletingCurrent = versionsToDelete.some((v) => v.version === prompt.current_version)

  let newCurrentVersion: string | null = null
  let newCurrentContent: string | null = null

  if (deletingCurrent) {
    if (targetIndex === 0) {
      console.log('')
      console.log(
        chalk.yellow(
          `Warning: This deletion would remove all versions including the current version ${prompt.current_version}.`
        )
      )
      console.log(chalk.red('Please delete the entire prompt instead.'))
      return
    }
    newCurrentVersion = sortedVersions[targetIndex - 1].version
    newCurrentContent = await getPromptContentByVersion(prompt.id, newCurrentVersion)
  }

  console.log('')
  console.log(chalk.cyan('Delete version'))
  console.log(chalk.gray('--------------'))
  console.log(`${chalk.bold('Prompt:')}               ${profile.username}/${name}`)
  console.log(`${chalk.bold('Target version:')}       ${version}`)
  console.log(`${chalk.bold('Dependent versions:')}`)
  versionsToDelete.forEach((v) => {
    const isTarget = v.version === version
    console.log(`  - ${v.version} (${v.change_type})${isTarget ? chalk.gray(' [target]') : ''}`)
  })

  if (newCurrentVersion) {
    console.log(`${chalk.bold('New current version:')}  ${chalk.green(newCurrentVersion)}`)
  }
  console.log('')

  const confirmation = await text({
    message: `Continue? Type "${version}" to confirm:`,
    placeholder: version
  })

  if (isCancel(confirmation)) {
    cancel('Delete cancelled.')
    return
  }

  if (confirmation !== version) {
    console.log(chalk.red('Confirmation did not match. Aborting.'))
    return
  }

  const idsToDelete = versionsToDelete.map((v) => v.id)

  const { data: deletedRows, error: delError } = await supabase
    .from('prompt_versions')
    .delete()
    .in('id', idsToDelete)
    .select('id')

  if (delError) {
    console.log(chalk.red(`Delete error: ${delError.message}`))
    return
  }

  if (!deletedRows || deletedRows.length === 0) {
    console.log(
      chalk.red(
        `Error: No versions were deleted. This usually means Supabase Row Level Security (RLS) is blocking the DELETE operation on 'prompt_versions'. Please check your Supabase policies.`
      )
    )
    return
  }

  if (deletedRows.length !== idsToDelete.length) {
    console.log(
      chalk.yellow(
        `Warning: Only ${deletedRows.length} out of ${idsToDelete.length} versions were deleted.`
      )
    )
  }

  if (newCurrentVersion && newCurrentContent) {
    const { error: updateError } = await supabase
      .from('prompts')
      .update({
        current_version: newCurrentVersion,
        current_content: newCurrentContent
      })
      .eq('id', prompt.id)

    if (updateError) {
      console.log(
        chalk.red(
          `Warning: Versions deleted, but could not update current_version: ${updateError.message}`
        )
      )
    }
  }

  outro(chalk.green(`Deleted ${versionsToDelete.length} version(s) successfully.`))
}

async function handleDeletePrompt(profile: UserProfile, name: string): Promise<void> {
  const prompt = await findActivePrompt(profile.username, name)

  if (!prompt) {
    console.log(chalk.red(`Prompt not found: ${profile.username}/${name}`))
    return
  }

  if (prompt.owner_id !== profile.id) {
    console.log(chalk.red('You do not own this prompt.'))
    return
  }

  const versionCount = await countPromptVersions(prompt.id)

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 7)
  const expiresAtFormatted = expiresAt.toISOString().split('T')[0]

  console.log('')
  console.log(chalk.cyan('Delete prompt'))
  console.log(chalk.gray('-------------'))
  console.log(`${chalk.bold('Prompt:')}          ${profile.username}/${name}`)
  console.log(`${chalk.bold('Current version:')} ${prompt.current_version}`)
  console.log(`${chalk.bold('Versions:')}        ${versionCount}`)
  console.log('')
  console.log(chalk.gray('This prompt will no longer appear in search or get.'))
  console.log(chalk.gray(`It will be permanently deleted after 7 days (${expiresAtFormatted}).`))
  console.log(chalk.gray('This action will not reset your post limit usage.'))
  console.log('')

  const confirmation = await text({
    message: `Continue? Type "${name}" to confirm:`,
    placeholder: name
  })

  if (isCancel(confirmation)) {
    cancel('Delete cancelled.')
    return
  }

  if (confirmation !== name) {
    console.log(chalk.red('Confirmation did not match. Aborting.'))
    return
  }

  const { error } = await supabase
    .from('prompts')
    .update({
      status: 'deleted',
      deleted_at: new Date().toISOString()
    })
    .eq('id', prompt.id)

  if (error) {
    console.log(chalk.red(`Delete error: ${error.message}`))
    return
  }

  outro(
    chalk.green(
      `Prompt deleted: ${profile.username}/${name}\n` +
        chalk.gray(`  Permanently removed after: ${expiresAtFormatted}`)
    )
  )
}

async function findActivePrompt(username: string, name: string): Promise<PromptRecord | null> {
  const { data, error } = await supabase
    .from('prompts')
    .select('id, owner_id, name, current_version')
    .eq('username', username)
    .eq('name', name)
    .eq('status', 'active')
    .maybeSingle()

  if (error) {
    throw new Error(`Could not fetch prompt: ${error.message}`)
  }

  return data
}

async function countPromptVersions(promptId: string): Promise<number> {
  const { count, error } = await supabase
    .from('prompt_versions')
    .select('id', { count: 'exact', head: true })
    .eq('prompt_id', promptId)

  if (error) {
    throw new Error(`Could not count versions: ${error.message}`)
  }

  return count ?? 0
}

function compareSemver(a: string, b: string): number {
  const versionA = parseSemver(a)
  const versionB = parseSemver(b)

  if (!versionA || !versionB) {
    throw new Error('Invalid semantic version found.')
  }

  if (versionA.major !== versionB.major) return versionA.major - versionB.major
  if (versionA.minor !== versionB.minor) return versionA.minor - versionB.minor
  return versionA.patch - versionB.patch
}

function parseSemver(version: string): Semver | null {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/)
  if (!match) return null

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3])
  }
}
