import { supabase } from './supabase.js'

export const POST_LIMIT = 50

/**
 * Returns the total number of posts (prompts + versions) for a user.
 * Each row in prompt_versions counts as 1 post.
 */
export async function getUserPostCount(userId: string): Promise<number> {
  const { data: promptIds, error: promptsError } = await supabase
    .from('prompts')
    .select('id')
    .eq('owner_id', userId)

  if (promptsError) {
    throw new Error(`Could not check post limit: ${promptsError.message}`)
  }

  if (!promptIds || promptIds.length === 0) {
    return 0
  }

  const ids = promptIds.map((p) => p.id)

  const { count, error: versionsError } = await supabase
    .from('prompt_versions')
    .select('id', { count: 'exact', head: true })
    .in('prompt_id', ids)

  if (versionsError) {
    throw new Error(`Could not check post limit: ${versionsError.message}`)
  }

  return count ?? 0
}

/**
 * Throws an error if the user has reached or exceeded the post limit.
 */
export async function assertWithinPostLimit(userId: string): Promise<void> {
  const count = await getUserPostCount(userId)

  if (count >= POST_LIMIT) {
    throw new Error(
      `Post limit reached. You have used ${count}/${POST_LIMIT} posts.\n` +
        `  Each prompt publish and each version update counts as 1 post.`
    )
  }
}
