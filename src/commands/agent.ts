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
              `Prompt "${resolved.name}" is already installed on ${adapter.name}. Use --force to overwrite.`
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
          chalk.green(`✔ Prompt "${resolved.name}" successfully installed on ${adapter.name}.`)
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
            chalk.yellow(`Prompt "${promptName}" was not found on ${adapter.name}.`)
          )
          return
        }

        await adapter.uninstall(promptName)

        console.log(
          chalk.green(`✔ Prompt "${promptName}" successfully removed from ${adapter.name}.`)
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
}
