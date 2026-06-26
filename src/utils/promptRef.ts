export type PromptRef = {
  user: string
  promptName: string
  version?: string
}

export function parsePromptRef(ref: string): PromptRef {
  if (!ref || typeof ref !== 'string') {
    throw new Error('Prompt reference is required.')
  }

  const parts = ref.split('/')

  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(
      'Invalid prompt reference. Use: prompt-it get user/prompt-name or user/prompt-name@version'
    )
  }

  const [user, promptPart] = parts

  const versionSeparatorIndex = promptPart.lastIndexOf('@')

  if (versionSeparatorIndex === -1) {
    return {
      user,
      promptName: promptPart
    }
  }

  const promptName = promptPart.slice(0, versionSeparatorIndex)
  const version = promptPart.slice(versionSeparatorIndex + 1)

  if (!promptName) {
    throw new Error(
      'Invalid prompt reference. Prompt name is required before @version.'
    )
  }

  if (!version) {
    throw new Error(
      'Invalid prompt reference. Version is required after @.'
    )
  }

  if (!isValidSemver(version)) {
    throw new Error(
      'Invalid version. Use semantic version format like 1.0.1.'
    )
  }

  return {
    user,
    promptName,
    version
  }
}

function isValidSemver(version: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(version)
}