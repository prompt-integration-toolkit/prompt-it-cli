import chalk from 'chalk'
import { text, isCancel, cancel, outro } from '@clack/prompts'
import type { Command } from 'commander'

import { supabase } from '../services/supabase.js'
import { getSession } from '../services/session.js'
import { getProfileFromSession, type UserProfile } from '../services/profile.js'

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
      console.log(chalk.red('Revoking specific versions is not implemented yet.'))
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
