const REGISTRY_RAW_BASE_URL =
  'https://raw.githubusercontent.com/Prompt-It-org/prompt-it-registry/main'

export async function getPromptContent(user, promptName) {
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

export async function getPromptMetadata(user, promptName) {
  const url = `${REGISTRY_RAW_BASE_URL}/users/${user}/${promptName}/metadata.json`

  const response = await fetch(url)

  if (!response.ok) {
    return {
      name: promptName,
      title: promptName,
      author: user
    }
  }

  return response.json()
}