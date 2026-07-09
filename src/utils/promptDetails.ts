import path from 'node:path'
import process from 'node:process'
import fs from 'fs-extra'

export type PromptDetails = {
  'prompt-file': string
  name: string
  title: string
  description: string
  version: string
  tags: string[]
}

const PROMPT_DETAILS_FILE = 'prompt-details.json'

export async function readPromptDetails(): Promise<PromptDetails | null> {
  const filePath = path.join(process.cwd(), PROMPT_DETAILS_FILE)

  const exists = await fs.pathExists(filePath)

  if (!exists) {
    return null
  }

  return fs.readJson(filePath) as Promise<PromptDetails>
}

export function normalizeTags(tags: string | string[] | undefined): string[] {
  if (!tags) {
    return []
  }

  if (Array.isArray(tags)) {
    return tags
  }

  return tags
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
}
