import chalk from 'chalk'
import { select, isCancel, cancel, outro, spinner } from '@clack/prompts'
import type { Command } from 'commander'

import { supabase } from '../services/supabase.js'

const RESULTS_PER_PAGE = 10

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

const promptSearchFields: PromptSearchField[] = ['name', 'title', 'description', 'username']

export function registerSearchCommand(program: Command): void {
  program
    .command('search')
    .description('Search public prompts or users. Use @username to search users.')
    .argument('<query>', 'Search term. Prefix with @ to search users (e.g. @username).')
    .action(async (query: string) => {
      try {
        const normalizedQuery = query.trim()

        if (!normalizedQuery) {
          console.log(chalk.red('Search query cannot be empty.'))
          return
        }

        if (normalizedQuery.startsWith('@')) {
          const userQuery = normalizedQuery.slice(1)

          if (!userQuery) {
            console.log(chalk.red('Username is required. Example: prompt-it search @username'))
            return
          }

          await searchUsers(userQuery)
          return
        }

        await searchPrompts(normalizedQuery)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unexpected error occurred.'

        console.log(chalk.red(`Error: ${message}`))
      }
    })
}

async function searchPrompts(query: string): Promise<void> {
  const s = spinner({ indicator: 'timer' })
  s.start('Searching prompts...')

  const pattern = createIlikePattern(query)

  // Run SELECT + COUNT for all fields simultaneously — no more sequential COUNT queries
  const fieldResults = await Promise.all(
    promptSearchFields.map((field) =>
      supabase
        .from('prompts')
        .select('username, name, title, description, current_version, tags', {
          count: 'exact'
        })
        .eq('visibility', 'public')
        .eq('status', 'active')
        .ilike(field, pattern)
        .order('updated_at', { ascending: false })
        .range(0, RESULTS_PER_PAGE - 1)
    )
  )

  const matchIndex = fieldResults.findIndex((r) => !r.error && r.count != null && r.count > 0)

  if (matchIndex === -1) {
    s.stop(chalk.yellow(`No results found for "${query}".`))
    return
  }

  const { data, count } = fieldResults[matchIndex]
  const field = promptSearchFields[matchIndex]
  const total = count!

  s.stop(chalk.green(`Found ${total} result(s).`))

  await paginatePromptResults({
    query,
    field,
    total,
    initialData: (data ?? []) as PromptResult[]
  })
}

async function paginatePromptResults(params: {
  query: string
  field: PromptSearchField
  total: number
  initialData: PromptResult[]
}): Promise<void> {
  const totalPages = Math.ceil(params.total / RESULTS_PER_PAGE)
  let currentPage = 1
  let currentData = params.initialData

  while (true) {
    renderPromptResults({
      query: params.query,
      field: params.field,
      results: currentData,
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
    } else if (action === 'previous' && currentPage > 1) {
      currentPage--
    } else {
      continue
    }

    const from = (currentPage - 1) * RESULTS_PER_PAGE
    const to = from + RESULTS_PER_PAGE - 1

    const { data, error } = await supabase
      .from('prompts')
      .select('username, name, title, description, current_version, tags')
      .eq('visibility', 'public')
      .eq('status', 'active')
      .ilike(params.field, createIlikePattern(params.query))
      .order('updated_at', { ascending: false })
      .range(from, to)

    if (error) {
      throw new Error(`Could not fetch prompt results: ${error.message}`)
    }

    currentData = (data ?? []) as PromptResult[]
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
    chalk.gray(`Page ${params.currentPage} of ${params.totalPages} — ${params.total} result(s)`)
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

  const s = spinner({ indicator: 'timer' })
  s.start('Searching users...')

  // SELECT + COUNT combined into a single query
  const { data, count, error } = await supabase
    .from('profiles')
    .select('id, username, display_name', { count: 'exact' })
    .or(`username.ilike.${pattern},display_name.ilike.${pattern}`)
    .order('username', { ascending: true })
    .range(0, RESULTS_PER_PAGE - 1)

  if (error) {
    s.stop()
    throw new Error(`Could not search users: ${error.message}`)
  }

  if (!count || count <= 0) {
    s.stop(chalk.yellow(`No users found for "${query}".`))
    return
  }

  s.stop(chalk.green(`Found ${count} user(s).`))

  await paginateUserResults({
    query,
    total: count,
    initialData: (data ?? []) as UserResult[]
  })
}

async function paginateUserResults(params: {
  query: string
  total: number
  initialData: UserResult[]
}): Promise<void> {
  const totalPages = Math.ceil(params.total / RESULTS_PER_PAGE)
  let currentPage = 1
  let currentData = params.initialData

  while (true) {
    await renderUserResults({
      query: params.query,
      results: currentData,
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
    } else if (action === 'previous' && currentPage > 1) {
      currentPage--
    } else {
      continue
    }

    const from = (currentPage - 1) * RESULTS_PER_PAGE
    const to = from + RESULTS_PER_PAGE - 1
    const nextPattern = createIlikePattern(params.query)

    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, display_name')
      .or(`username.ilike.${nextPattern},display_name.ilike.${nextPattern}`)
      .order('username', { ascending: true })
      .range(from, to)

    if (error) {
      throw new Error(`Could not fetch user results: ${error.message}`)
    }

    currentData = (data ?? []) as UserResult[]
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
    chalk.gray(`Page ${params.currentPage} of ${params.totalPages} — ${params.total} result(s)`)
  )
  console.log('')

  // Fetch all prompt counts for this page in parallel — no more sequential queries
  const promptCounts = await Promise.all(
    params.results.map((user) => countPublicPromptsByUserId(user.id))
  )

  for (const [index, user] of params.results.entries()) {
    const globalIndex = (params.currentPage - 1) * RESULTS_PER_PAGE + index + 1

    console.log(chalk.bold(`${globalIndex}. ${user.username}`))

    if (user.display_name) {
      console.log(chalk.gray(`   Display name: ${user.display_name}`))
    }

    console.log(chalk.gray(`   Public prompts: ${promptCounts[index]}`))
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
    .eq('status', 'active')

  if (error) {
    throw new Error(`Could not count user prompts: ${error.message}`)
  }

  return count ?? 0
}
