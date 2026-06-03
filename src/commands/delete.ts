import chalk from 'chalk'
import { text, isCancel, cancel, outro } from '@clack/prompts'
import type { Command } from 'commander'

import { supabase } from '../services/supabase.js'
import { getSession } from '../services/session.js'
import { getProfileFromSession } from '../services/profile.js'

type PromptRecord = {
  id: string
  owner_id: string
  name: string
  current_version: string
}

export function registerDeleteCommand(program: Command): void {
  program
    .command('delete <name>')
    .description('Soft delete a prompt you own.')
    .action(async (name: string) => {
      await handleDelete(name)
    })
}

async function handleDelete(name: string): Promise<void> {
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
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unexpected error occurred.'

    console.log(chalk.red(`Error: ${message}`))
  }
}

async function findActivePrompt(
  username: string,
  name: string
): Promise<PromptRecord | null> {
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
