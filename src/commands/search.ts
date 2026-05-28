import chalk from 'chalk'
import { select, isCancel, cancel, outro } from '@clack/prompts'
import type { Command } from 'commander'

import { supabase } from '../services/supabase.js'

const RESULTS_PER_PAGE = 10

type SearchOptions = {
  users?: boolean
}

type PromptSearchField = 'name' | 'title' | 'description' | 'username'

type PromptResult = {
  username: string
  name: string
  title: string
  description: string
  current_version: string
  tags: string[]
}

type UserResult = {
  id: string
  username: string
  display_name: string | null
}

type PageAction = 'next' | 'previous' | 'exit'

const promptSearchFields: PromptSearchField[] = [
  'name',
  'title',
  'description',
  'username'
]

export function registerSearchCommand(program: Command): void {
  program
    .command('search')
    .description('Search public prompts or users.')
    .argument('<query>', 'Search term.')
    .option('--users', 'Search users instead of prompts.')
    .action(async (query: string, options: SearchOptions) => {
      try {
        const normalizedQuery = query.trim()

        if (!normalizedQuery) {
          console.log(chalk.red('Search query cannot be empty.'))
          return
        }

        if (options.users) {
          await searchUsers(normalizedQuery)
          return
        }

        await searchPrompts(normalizedQuery)
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unexpected error occurred.'

        console.log(chalk.red(`Error: ${message}`))
      }
    })
}

async function searchPrompts(query: string): Promise<void> {
  const result = await findPromptSearchField(query)

  if (!result) {
    console.log(chalk.yellow(`No results found for "${query}".`))
    return
  }

  await paginatePromptResults({
    query,
    field: result.field,
    total: result.total
  })
}

async function findPromptSearchField(
  query: string
): Promise<{ field: PromptSearchField; total: number } | null> {
  const pattern = createIlikePattern(query)

  for (const field of promptSearchFields) {
    const { count, error } = await supabase
      .from('prompts')
      .select('id', {
        count: 'exact',
        head: true
      })
      .eq('visibility', 'public')
      .ilike(field, pattern)

    if (error) {
      throw new Error(`Could not search prompts: ${error.message}`)
    }

    if (count && count > 0) {
      return {
        field,
        total: count
      }
    }
  }

  return null
}

async function paginatePromptResults(params: {
  query: string
  field: PromptSearchField
  total: number
}): Promise<void> {
  const totalPages = Math.ceil(params.total / RESULTS_PER_PAGE)
  let currentPage = 1

  while (true) {
    const from = (currentPage - 1) * RESULTS_PER_PAGE
    const to = from + RESULTS_PER_PAGE - 1

    const { data, error } = await supabase
      .from('prompts')
      .select('username, name, title, description, current_version, tags')
      .eq('visibility', 'public')
      .ilike(params.field, createIlikePattern(params.query))
      .order('updated_at', { ascending: false })
      .range(from, to)

    if (error) {
      throw new Error(`Could not fetch prompt results: ${error.message}`)
    }

    renderPromptResults({
      query: params.query,
      field: params.field,
      results: data ?? [],
      total: params.total,
      currentPage,
      totalPages
    })

    if (totalPages <= 1) {
      outro(chalk.green('Search finished.'))
      return
    }

    const action = await askPageAction(currentPage, totalPages)

    if (isCancel(action) || action === 'exit') {
      cancel('Search closed.')
      return
    }

    if (action === 'next' && currentPage < totalPages) {
      currentPage++
      continue
    }

    if (action === 'previous' && currentPage > 1) {
      currentPage--
      continue
    }
  }
}

function renderPromptResults(params: {
  query: string
  field: PromptSearchField
  results: PromptResult[]
  total: number
  currentPage: number
  totalPages: number
}): void {

  console.log('')
  console.log(chalk.cyan(`Search results for "${params.query}"`))
  console.log(chalk.gray(`Matched by: ${params.field}`))
  console.log(
    chalk.gray(
      `Page ${params.currentPage} of ${params.totalPages} — ${params.total} result(s)`
    )
  )
  console.log('')

  params.results.forEach((prompt, index) => {
    const globalIndex = (params.currentPage - 1) * RESULTS_PER_PAGE + index + 1
    const tags = prompt.tags?.length ? prompt.tags.join(', ') : 'none'

    console.log(chalk.bold(`${globalIndex}. ${prompt.username}/${prompt.name}`))
    console.log(`   ${prompt.title}`)
    console.log(chalk.gray(`   ${prompt.description}`))
    console.log(chalk.gray(`   Version: ${prompt.current_version}`))
    console.log(chalk.gray(`   Tags: ${tags}`))
    console.log(chalk.gray(`   Get: prompt-it get ${prompt.username}/${prompt.name}`))
    console.log('')
  })
}

async function searchUsers(query: string): Promise<void> {
  const pattern = createIlikePattern(query)

  const { count, error: countError } = await supabase
    .from('profiles')
    .select('id', {
      count: 'exact',
      head: true
    })
    .or(`username.ilike.${pattern},display_name.ilike.${pattern}`)

  if (countError) {
    throw new Error(`Could not search users: ${countError.message}`)
  }

  if (!count || count <= 0) {
    console.log(chalk.yellow(`No users found for "${query}".`))
    return
  }

  await paginateUserResults({
    query,
    total: count
  })
}

async function paginateUserResults(params: {
  query: string
  total: number
}): Promise<void> {
  const totalPages = Math.ceil(params.total / RESULTS_PER_PAGE)
  let currentPage = 1

  while (true) {
    const from = (currentPage - 1) * RESULTS_PER_PAGE
    const to = from + RESULTS_PER_PAGE - 1

    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, display_name')
      .or(
        `username.ilike.${createIlikePattern(
          params.query
        )},display_name.ilike.${createIlikePattern(params.query)}`
      )
      .order('username', { ascending: true })
      .range(from, to)

    if (error) {
      throw new Error(`Could not fetch user results: ${error.message}`)
    }

    await renderUserResults({
        query: params.query,
        results: data ?? [],
        total: params.total,
        currentPage,
        totalPages
    })

    if (totalPages <= 1) {
      outro(chalk.green('Search finished.'))
      return
    }

    const action = await askPageAction(currentPage, totalPages)

    if (isCancel(action) || action === 'exit') {
      cancel('Search closed.')
      return
    }

    if (action === 'next' && currentPage < totalPages) {
      currentPage++
      continue
    }

    if (action === 'previous' && currentPage > 1) {
      currentPage--
      continue
    }
  }
}

async function renderUserResults(params: {
  query: string
  results: UserResult[]
  total: number
  currentPage: number
  totalPages: number
}): Promise<void> {

  console.log('')
  console.log(chalk.cyan(`Users found for "${params.query}"`))
  console.log(
    chalk.gray(
      `Page ${params.currentPage} of ${params.totalPages} — ${params.total} result(s)`
    )
  )
  
  console.log('')

  for (const [index, user] of params.results.entries()) {
    const globalIndex = (params.currentPage - 1) * RESULTS_PER_PAGE + index + 1
    const promptsCount = await countPublicPromptsByUserId(user.id)

    console.log(chalk.bold(`${globalIndex}. ${user.username}`))

    if (user.display_name) {
      console.log(chalk.gray(`   Display name: ${user.display_name}`))
    }

    console.log(chalk.gray(`   Public prompts: ${promptsCount}`))
    console.log('')
  }
}

type PageOption = {
  value: PageAction
  label: string
}

async function askPageAction(
  currentPage: number,
  totalPages: number
): Promise<PageAction | symbol> {
  const options: PageOption[] = []

  if (currentPage < totalPages) {
    options.push({
      value: 'next',
      label: 'Next page'
    })
  }

  if (currentPage > 1) {
    options.push({
      value: 'previous',
      label: 'Previous page'
    })
  }

  options.push({
    value: 'exit',
    label: 'Close search'
  })

  return select<PageAction>({
    message: 'What do you want to do?',
    options
  })
}

function createIlikePattern(query: string): string {
  return `%${query.replaceAll('%', '\\%').replaceAll('_', '\\_')}%`
}

async function countPublicPromptsByUserId(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('prompts')
    .select('id', {
      count: 'exact',
      head: true
    })
    .eq('owner_id', userId)
    .eq('visibility', 'public')

  if (error) {
    throw new Error(`Could not count user prompts: ${error.message}`)
  }

  return count ?? 0
}