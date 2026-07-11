import chalk from 'chalk'
import { text, isCancel, cancel, outro } from '@clack/prompts'
import type { Command } from 'commander'

import { supabase } from '../services/supabase.js'
import { getSession } from '../services/session.js'
import { getProfileFromSession, type UserProfile } from '../services/profile.js'
import { getPromptContentByVersion } from '../utils/promptResolver.js'
import { compareSemver } from '../utils/semver.js'

type PromptVersionRecord = {
  id: string
  version: string
  deleted_at: string | null
}

export function registerRevokeCommand(program: Command): void {
  program
    .command('revoke <name>')
    .description('Recover a deleted prompt (e.g. prompt-name)')
    .action(async (name: string) => {
      await handleRevoke(name)
    })
}

async function handleRevoke(inputName: string): Promise<void> {
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
      await handleRevokeVersion(profile, promptName, targetVersion)
      return
    }

    await handleRevokePrompt(profile, inputName)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error occurred.'

    console.log(chalk.red(`Error: ${message}`))
  }
}

async function handleRevokePrompt(profile: UserProfile, name: string): Promise<void> {
  const { data: prompt, error: fetchError } = await supabase
    .from('prompts')
    .select('id, owner_id, name, current_version')
    .eq('username', profile.username)
    .eq('name', name)
    .eq('status', 'deleted')
    .maybeSingle()

  if (fetchError) {
    console.log(chalk.red(`Could not fetch prompt: ${fetchError.message}`))
    return
  }

  if (!prompt) {
    console.log(chalk.red(`Deleted prompt not found: ${profile.username}/${name}`))
    return
  }

  if (prompt.owner_id !== profile.id) {
    console.log(chalk.red('You do not own this prompt.'))
    return
  }

  console.log('')
  console.log(chalk.cyan('Revoke prompt'))
  console.log(chalk.gray('-------------'))
  console.log(`${chalk.bold('Prompt:')}          ${profile.username}/${name}`)
  console.log(`${chalk.bold('Current version:')} ${prompt.current_version}`)
  console.log('')

  const confirmation = await text({
    message: `Continue? Type "${name}" to confirm you want to revoke deletion:`,
    placeholder: name
  })

  if (isCancel(confirmation)) {
    cancel('Revoke cancelled.')
    return
  }

  if (confirmation !== name) {
    console.log(chalk.red('Confirmation did not match. Aborting.'))
    return
  }

  const { error } = await supabase
    .from('prompts')
    .update({
      status: 'active',
      deleted_at: null
    })
    .eq('id', prompt.id)

  if (error) {
    console.log(chalk.red(`Revoke error: ${error.message}`))
    return
  }

  outro(chalk.green(`Prompt restored successfully: ${profile.username}/${name}`))
}

async function handleRevokeVersion(
  profile: UserProfile,
  name: string,
  version: string
): Promise<void> {
  const { data: prompt, error: fetchError } = await supabase
    .from('prompts')
    .select('id, owner_id, name, current_version')
    .eq('username', profile.username)
    .eq('name', name)
    .eq('status', 'active')
    .maybeSingle()

  if (fetchError) {
    console.log(chalk.red(`Could not fetch prompt: ${fetchError.message}`))
    return
  }

  if (!prompt) {
    console.log(chalk.red(`Active prompt not found: ${profile.username}/${name}`))
    return
  }

  if (prompt.owner_id !== profile.id) {
    console.log(chalk.red('You do not own this prompt.'))
    return
  }

  const { data: versions, error: verError } = await supabase
    .from('prompt_versions')
    .select('id, version, deleted_at')
    .eq('prompt_id', prompt.id)

  if (verError) {
    console.log(chalk.red(`Could not fetch versions: ${verError.message}`))
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

  const targetVersionRecord = sortedVersions[targetIndex]
  if (!targetVersionRecord.deleted_at) {
    console.log(chalk.yellow(`Version ${version} is already active.`))
    return
  }

  const targetDeletedAt = targetVersionRecord.deleted_at

  // Check dependencies
  for (let i = 0; i < targetIndex; i++) {
    const v = sortedVersions[i]
    if (v.deleted_at && v.deleted_at !== targetDeletedAt) {
      console.log(
        chalk.red(
          `Error: Cannot revoke version ${version} because its dependent versions ` +
            `are deleted or unavailable.\n` +
            `Please revoke the root version (if possible) first.`
        )
      )
      return
    }
  }

  const versionsToRestore = sortedVersions.filter((v) => v.deleted_at === targetDeletedAt)

  console.log('')
  console.log(chalk.cyan('Revoke version'))
  console.log(chalk.gray('--------------'))
  console.log(`${chalk.bold('Prompt:')}          ${profile.username}/${name}`)
  console.log(`${chalk.bold('Target version:')}  ${version}`)
  console.log(
    `${chalk.bold('Restoring:')}       ${versionsToRestore.map((v) => v.version).join(', ')}`
  )
  console.log('')

  const confirmation = await text({
    message: `Continue? Type "${version}" to confirm:`,
    placeholder: version
  })

  if (isCancel(confirmation)) {
    cancel('Revoke cancelled.')
    return
  }

  if (confirmation !== version) {
    console.log(chalk.red('Confirmation did not match. Aborting.'))
    return
  }

  const idsToRestore = versionsToRestore.map((v) => v.id)

  const { error: updateError } = await supabase
    .from('prompt_versions')
    .update({ deleted_at: null })
    .in('id', idsToRestore)

  if (updateError) {
    console.log(chalk.red(`Revoke error: ${updateError.message}`))
    return
  }

  // Find the new current version (highest active version after restore)
  const activeVersions = sortedVersions.filter(
    (v) => !v.deleted_at || v.deleted_at === targetDeletedAt
  )
  const newCurrentVersion = activeVersions[activeVersions.length - 1].version

  const newCurrentContent = await getPromptContentByVersion(prompt.id, newCurrentVersion)

  const { error: promptUpdateError } = await supabase
    .from('prompts')
    .update({
      current_version: newCurrentVersion,
      current_content: newCurrentContent
    })
    .eq('id', prompt.id)

  if (promptUpdateError) {
    console.log(
      chalk.red(
        `Warning: Versions restored, but could not update current_version: ${promptUpdateError.message}`
      )
    )
  }

  outro(chalk.green('Versions restored successfully!'))
}
