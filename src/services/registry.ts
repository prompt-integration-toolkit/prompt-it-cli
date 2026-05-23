export type PromptMetadata = {
  name: string
  title: string
  author: string
  description?: string
  version?: string
  tags?: string[]
  visibility?: string
  createdAt?: string
  updatedAt?: string
  path?: string
}

const REGISTRY_RAW_BASE_URL =
  'https://raw.githubusercontent.com/Prompt-It-org/prompt-it-registry/main'

export async function getPromptContent(
  user: string,
  promptName: string
): Promise<string> {
  const url = `${REGISTRY_RAW_BASE_URL}/users/${user}/${promptName}/prompt.md`

  const response = await fetch(url)

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Prompt not found: ${user}/${promptName}`)
    }

    throw new Error(`Failed to fetch prompt. Status: ${response.status}`)
  }

  return response.text()
}

export async function getPromptMetadata(
  user: string,
  promptName: string
): Promise<PromptMetadata> {
  const url = `${REGISTRY_RAW_BASE_URL}/users/${user}/${promptName}/metadata.json`

  const response = await fetch(url)

  if (!response.ok) {
    return {
      name: promptName,
      title: promptName,
      author: user
    }
  }

  return response.json() as Promise<PromptMetadata>
}