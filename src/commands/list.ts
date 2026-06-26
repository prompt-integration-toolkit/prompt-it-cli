import chalk from 'chalk'
import { diffLines } from 'diff'
import type { Command } from 'commander'

import { supabase } from '../services/supabase.js'
import { getSession } from '../services/session.js'
import {
  getPromptContentByVersion,
  compareSemver
} from '../utils/promptResolver.js'

export function registerListCommand(program: Command): void {
  program
    .command('list')
    .description('List your prompts, view prompt history, or compare versions.')
    .argument('[target]', 'Target prompt. Example: "my-prompt" or "my-prompt@1.0.1"')
    .action(async (target: string | undefined) => {
      try {
        // @username lookup — does not require login
        if (target && target.startsWith('@')) {
          const raw = target.slice(1) // remove the @

          if (raw.includes('/')) {
            console.log(chalk.red('Invalid format. Use prompt-it get ' + raw + ' to get a specific prompt.'))
            return
          }

          if (!raw) {
            console.log(chalk.red('Username is required. Use: prompt-it list @<username>'))
            return
          }

          await listUserPublicPrompts(raw)
          return
        }

        const session = await getSession()

        if (!session) {
          console.log(chalk.red('You must be logged in to use this command.'))
          return
        }

        if (!target) {
          await listAllPrompts(session.user.id)
          return
        }

        if (target.includes('@')) {
          const [promptName, version] = target.split('@')
          if (!promptName || !version) {
            console.log(chalk.red('Invalid format. Use <prompt-name>@<version>.'))
            return
          }
          await showVersionDiff(session.user.id, promptName, version)
          return
        }

        await listPromptDetails(session.user.id, target)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unexpected error occurred.'
        console.log(chalk.red(`Error: ${message}`))
      }
    })
}

async function listAllPrompts(userId: string): Promise<void> {
  const { data, error } = await supabase
    .from('prompts')
    .select('name, current_version, description')
    .eq('owner_id', userId)
    .order('name')

  if (error) {
    throw new Error(`Could not fetch prompts: ${error.message}`)
  }

  const prompts = data ?? []

  if (prompts.length === 0) {
    console.log(chalk.yellow('No prompts found.'))
    return
  }

  console.log(`\nYour Prompts [${prompts.length}]\n`)

  prompts.forEach((prompt, index) => {
    console.log(chalk.bold(`${index + 1}. ${prompt.name}`))
    
    if (prompt.description) {
      console.log(chalk.gray(`   ${prompt.description}`))
    } else {
      console.log(chalk.gray(`   No description`))
    }
    
    console.log(chalk.gray(`   Version: v${prompt.current_version}`))
    console.log('')
  })
}

async function listPromptDetails(userId: string, promptName: string): Promise<void> {
  const { data: prompt, error: promptError } = await supabase
    .from('prompts')
    .select('id, description, created_at')
    .eq('owner_id', userId)
    .eq('name', promptName)
    .maybeSingle()

  if (promptError) {
    throw new Error(`Could not fetch prompt: ${promptError.message}`)
  }

  if (!prompt) {
    console.log(chalk.red(`Prompt not found: ${promptName}`))
    return
  }

  const { data: versions, error: versionsError } = await supabase
    .from('prompt_versions')
    .select('version, created_at')
    .eq('prompt_id', prompt.id)

  if (versionsError) {
    throw new Error(`Could not fetch prompt versions: ${versionsError.message}`)
  }

  const sortedVersions = (versions ?? []).sort((a, b) => compareSemver(b.version, a.version))

  console.log(`\n• ${chalk.bold(promptName)}\n`)
  console.log(`Description: ${prompt.description || 'No description'}`)
  console.log(`Created at: ${new Date(prompt.created_at).toISOString().split('T')[0]}\n`)
  console.log('Version History:')

  for (let i = 0; i < sortedVersions.length; i++) {
    const v = sortedVersions[i]
    const isCurrent = i === 0
    const currentLabel = isCurrent ? ' (Current)' : ''
    
    const daysAgo = Math.floor((new Date().getTime() - new Date(v.created_at).getTime()) / (1000 * 3600 * 24))
    let timeLabel = ''
    if (daysAgo === 0) {
      timeLabel = 'Today'
    } else if (i === sortedVersions.length - 1) {
      timeLabel = `Created ${daysAgo} days ago`
    } else {
      timeLabel = `Updated ${daysAgo} days ago`
    }

    console.log(`  - ${chalk.cyan('v' + v.version)}${currentLabel} - ${timeLabel}`)
  }
  
  console.log('')
}

async function showVersionDiff(userId: string, promptName: string, targetVersion: string): Promise<void> {
  const { data: prompt, error: promptError } = await supabase
    .from('prompts')
    .select('id')
    .eq('owner_id', userId)
    .eq('name', promptName)
    .maybeSingle()

  if (promptError) {
    throw new Error(`Could not fetch prompt: ${promptError.message}`)
  }

  if (!prompt) {
    console.log(chalk.red(`Prompt not found: ${promptName}`))
    return
  }

  const { data: versions, error: versionsError } = await supabase
    .from('prompt_versions')
    .select('version')
    .eq('prompt_id', prompt.id)

  if (versionsError) {
    throw new Error(`Could not fetch prompt versions: ${versionsError.message}`)
  }

  const sortedVersions = (versions ?? [])
    .map(v => v.version)
    .sort((a, b) => compareSemver(a, b))

  const targetIndex = sortedVersions.indexOf(targetVersion)

  if (targetIndex === -1) {
    console.log(chalk.red(`Version ${targetVersion} not found for prompt ${promptName}.`))
    return
  }

  let previousVersion: string | null = null
  if (targetIndex > 0) {
    previousVersion = sortedVersions[targetIndex - 1]
  }

  const targetContent = await getPromptContentByVersion(prompt.id, targetVersion)
  const previousContent = previousVersion 
    ? await getPromptContentByVersion(prompt.id, previousVersion)
    : ''

  console.log(`\n${chalk.bold.cyan(`${promptName}@${targetVersion}`)}`)
  if (previousVersion) {
    console.log(`(Compared to previous version v${previousVersion})\n`)
  } else {
    console.log(`(Initial version)\n`)
  }

  const diff = diffLines(previousContent, targetContent)

  for (const part of diff) {
    if (!part.value) continue
    
    const lines = part.value.replace(/\n$/, '').split('\n')
    for (const line of lines) {
      if (part.added) {
        console.log(chalk.green(`+${line}`))
      } else if (part.removed) {
        console.log(chalk.red(`-${line}`))
      } else {
        console.log(chalk.gray(` ${line}`))
      }
    }
  }
  console.log('')
}

async function listUserPublicPrompts(username: string): Promise<void> {
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', username)
    .maybeSingle()

  if (profileError) {
    throw new Error(`Could not fetch user: ${profileError.message}`)
  }

  if (!profile) {
    console.log(chalk.red(`User not found: @${username}`))
    return
  }

  const { data, error } = await supabase
    .from('prompts')
    .select('name, current_version, description')
    .eq('owner_id', profile.id)
    .eq('visibility', 'public')
    .eq('status', 'active')
    .order('name')

  if (error) {
    throw new Error(`Could not fetch prompts: ${error.message}`)
  }

  const prompts = data ?? []

  if (prompts.length === 0) {
    console.log(chalk.yellow(`@${username} has no public prompts.`))
    return
  }

  console.log(`\n@${username}'s Public Prompts [${prompts.length}]\n`)

  prompts.forEach((prompt, index) => {
    console.log(chalk.bold(`${index + 1}. ${prompt.name}`))

    if (prompt.description) {
      console.log(chalk.gray(`   ${prompt.description}`))
    } else {
      console.log(chalk.gray(`   No description`))
    }

    console.log(chalk.gray(`   Version: v${prompt.current_version}`))
    console.log(chalk.gray(`   Get: prompt-it get ${username}/${prompt.name}`))
    console.log('')
  })
}
