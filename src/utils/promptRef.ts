export type PromptRef = {
  user: string
  promptName: string
}

export function parsePromptRef(ref: string): PromptRef {
  if (!ref || typeof ref !== 'string') {
    throw new Error('Prompt reference is required.')
  }

  const parts = ref.split('/')

  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(
      'Invalid prompt reference. Use: prompt-it get user/prompt-name'
    )
  }

  const [user, promptName] = parts

  return {
    user,
    promptName
  }
}