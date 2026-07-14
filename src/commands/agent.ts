import chalk from 'chalk'
import type { Command } from 'commander'

import { supabase } from '../services/supabase.js'
import { parsePromptRef } from '../utils/promptRef.js'
import { resolvePromptVersion } from '../utils/promptResolver.js'
import { AgentManager } from '../agent/AgentManager.js'

import type { SupabasePrompt } from '../utils/promptResolver.js'

type AgentAddOptions = {
  claude?: boolean
  codex?: boolean
  antigravity?: boolean
  force?: boolean
}

function resolveAgentName(options: AgentAddOptions): string | null {
  const agents: { flag: boolean | undefined; name: string }[] = [
    { flag: options.claude, name: 'claude' },
    { flag: options.codex, name: 'codex' },
    { flag: options.antigravity, name: 'antigravity' }
  ]

  const selected = agents.filter((a) => a.flag)

  if (selected.length === 0) return null
  if (selected.length > 1) return 'multiple'

  return selected[0].name
}

async function fetchPrompt(user: string, promptName: string): Promise<SupabasePrompt | null> {
  const { data, error } = await supabase
    .from('prompts')
    .select(
      'id, owner_id, name, title, description, username, current_content, current_version, tags'
    )
    .eq('username', user)
    .eq('name', promptName)
    .eq('visibility', 'public')
    .eq('status', 'active')
    .maybeSingle()

  if (error) {
    throw new Error(`Could not fetch prompt: ${error.message}`)
  }

  return data
}

function isPermissionError(error: unknown): boolean {
  if (error instanceof Error) {
    const code = (error as NodeJS.ErrnoException).code
    return code === 'EACCES' || code === 'EPERM'
  }
  return false
}

export function registerAgentCommand(program: Command): void {
  const agent = program
    .command('agent')
    .description('Manage prompt installations on AI agents.')

  agent
    .command('add')
    .description('Install a prompt on an AI agent.')
    .argument('<promptRef>', 'Prompt reference. Example: miguel/pro-code-reviewer')
    .option('--claude', 'Install on Claude Code.')
    .option('--codex', 'Install on Codex.')
    .option('--antigravity', 'Install on Antigravity IDE.')
    .option('--force', 'Overwrite if already installed.')
    .action(async (promptRef: string, options: AgentAddOptions) => {
      try {
        const agentName = resolveAgentName(options)

        if (!agentName) {
          console.log(chalk.red('You must specify an agent: --claude, --codex, or --antigravity.'))
          return
        }

        if (agentName === 'multiple') {
          console.log(chalk.red('Please specify only one agent at a time.'))
          return
        }

        const adapter = AgentManager.getAdapter(agentName)

        const { user, promptName, version } = parsePromptRef(promptRef)

        const prompt = await fetchPrompt(user, promptName)

        if (!prompt) {
          console.log(chalk.red(`Prompt not found: ${user}/${promptName}`))
          return
        }

        const resolved = await resolvePromptVersion(prompt, version)

        const alreadyInstalled = await adapter.isInstalled(resolved.name)

        if (alreadyInstalled && !options.force) {
          console.log(
            chalk.yellow(
              `Prompt "${resolved.name}" is already installed on ${adapter.displayName}. Use --force to overwrite.`
            )
          )
          return
        }

        await adapter.install({
          name: resolved.name,
          content: resolved.resolved_content,
          description: resolved.description,
          version: resolved.resolved_version
        })

        console.log(
          chalk.green(`✔ Prompt "${resolved.name}" successfully installed on ${adapter.displayName}.`)
        )
      } catch (error) {
        if (isPermissionError(error)) {
          console.log(
            chalk.red(
              '✖ Permission denied. Please run the command again using \'sudo\' if necessary.'
            )
          )
          return
        }

        const message = error instanceof Error ? error.message : 'Unexpected error occurred.'
        console.log(chalk.red(`Error: ${message}`))
      }
    })

  agent
    .command('remove')
    .description('Remove a prompt from an AI agent.')
    .argument('<promptName>', 'Name of the prompt to remove. Example: pro-code-reviewer')
    .option('--claude', 'Remove from Claude Code.')
    .option('--codex', 'Remove from Codex.')
    .option('--antigravity', 'Remove from Antigravity IDE.')
    .action(async (promptName: string, options: AgentAddOptions) => {
      try {
        const agentName = resolveAgentName(options)

        if (!agentName) {
          console.log(chalk.red('You must specify an agent: --claude, --codex, or --antigravity.'))
          return
        }

        if (agentName === 'multiple') {
          console.log(chalk.red('Please specify only one agent at a time.'))
          return
        }

        const adapter = AgentManager.getAdapter(agentName)

        const installed = await adapter.isInstalled(promptName)

        if (!installed) {
          console.log(
            chalk.yellow(`Prompt "${promptName}" was not found on ${adapter.displayName}.`)
          )
          return
        }

        await adapter.uninstall(promptName)

        console.log(
          chalk.green(`✔ Prompt "${promptName}" successfully removed from ${adapter.displayName}.`)
        )
      } catch (error) {
        if (isPermissionError(error)) {
          console.log(
            chalk.red(
              '✖ Permission denied. Please run the command again using \'sudo\' if necessary.'
            )
          )
          return
        }

        const message = error instanceof Error ? error.message : 'Unexpected error occurred.'
        console.log(chalk.red(`Error: ${message}`))
      }
    })

  agent
    .command('list')
    .description('List installed prompts on AI agents.')
    .argument('[promptName]', 'Optional. Search for a specific prompt across agents.')
    .option('--claude', 'Filter by Claude Code.')
    .option('--codex', 'Filter by Codex.')
    .option('--antigravity', 'Filter by Antigravity IDE.')
    .action(async (promptName: string | undefined, options: AgentAddOptions) => {
      try {
        const adapters = resolveAdapters(options)

        if (promptName) {
          await searchPromptAcrossAgents(promptName, adapters)
        } else {
          await listAllInstalledPrompts(adapters, options)
        }
      } catch (error) {
        if (isPermissionError(error)) {
          console.log(
            chalk.red(
              '✖ Permission denied. Please run the command again using \'sudo\' if necessary.'
            )
          )
          return
        }

        const message = error instanceof Error ? error.message : 'Unexpected error occurred.'
        console.log(chalk.red(`Error: ${message}`))
      }
    })
}

function resolveAdapters(options: AgentAddOptions): import('../agent/types/index.js').AgentAdapter[] {
  const allSelected = options.claude && options.codex && options.antigravity
  const noneSelected = !options.claude && !options.codex && !options.antigravity

  if (allSelected || noneSelected) {
    return AgentManager.getAllAdapters()
  }

  const adapters: import('../agent/types/index.js').AgentAdapter[] = []

  if (options.claude) adapters.push(AgentManager.getAdapter('claude'))
  if (options.codex) adapters.push(AgentManager.getAdapter('codex'))
  if (options.antigravity) adapters.push(AgentManager.getAdapter('antigravity'))

  return adapters
}

function formatAgentHeader(
  options: AgentAddOptions
): string {
  const allSelected = options.claude && options.codex && options.antigravity
  const noneSelected = !options.claude && !options.codex && !options.antigravity

  if (allSelected || noneSelected) {
    return 'Installed prompts:'
  }

  const names: string[] = []
  if (options.claude) names.push('Claude Code')
  if (options.codex) names.push('Codex')
  if (options.antigravity) names.push('Antigravity IDE')

  if (names.length === 1) {
    return `Installed prompts (${names[0]}):`
  }

  const last = names.pop()
  return `Installed prompts (${names.join(', ')} and ${last}):`
}

async function listAllInstalledPrompts(
  adapters: import('../agent/types/index.js').AgentAdapter[],
  options: AgentAddOptions
): Promise<void> {
  const results: { displayName: string; prompts: string[] }[] = []

  for (const adapter of adapters) {
    const prompts = await adapter.listInstalled()
    results.push({ displayName: adapter.displayName, prompts })
  }

  const hasAny = results.some((r) => r.prompts.length > 0)

  if (!hasAny) {
    const allSelected = options.claude && options.codex && options.antigravity
    const noneSelected = !options.claude && !options.codex && !options.antigravity

    if (allSelected || noneSelected) {
      console.log(chalk.yellow('No prompts installed on any agent.'))
    } else {
      const emptyNames = results.map((r) => r.displayName)
      const label = emptyNames.length === 1
        ? emptyNames[0]
        : `${emptyNames.slice(0, -1).join(', ')} and ${emptyNames[emptyNames.length - 1]}`
      console.log(chalk.yellow(`No prompts installed on ${label}.`))
    }
    return
  }

  console.log('')
  console.log(chalk.white(formatAgentHeader(options)))
  console.log('')

  for (const result of results) {
    if (result.prompts.length > 0) {
      console.log(chalk.cyan(result.displayName))
      for (const prompt of result.prompts) {
        console.log(`  • ${prompt}`)
      }
      console.log('')
    } else {
      const allSelected = options.claude && options.codex && options.antigravity
      const noneSelected = !options.claude && !options.codex && !options.antigravity

      if (!allSelected && !noneSelected) {
        console.log(chalk.yellow(`No prompts installed on ${result.displayName}.`))
        console.log('')
      }
    }
  }
}

async function searchPromptAcrossAgents(
  promptName: string,
  adapters: import('../agent/types/index.js').AgentAdapter[]
): Promise<void> {
  const foundOn: string[] = []

  for (const adapter of adapters) {
    const installed = await adapter.isInstalled(promptName)
    if (installed) {
      foundOn.push(adapter.displayName)
    }
  }

  if (foundOn.length === 0) {
    console.log(chalk.yellow(`Prompt "${promptName}" is not installed on any agent.`))
    return
  }

  console.log('')
  console.log(chalk.white(`Prompt "${promptName}" is installed on:`))
  for (const name of foundOn) {
    console.log(`  • ${name}`)
  }
  console.log('')
}
