import { supabase } from './supabase.js'
import type { PromptItSession } from './session.js'

export type UserProfile = {
  id: string
  username: string
  display_name: string
}

export async function getProfileFromSession(
  session: PromptItSession
): Promise<UserProfile> {
  await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token
  })

  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name')
    .eq('id', session.user.id)
    .maybeSingle()

  if (error) {
    throw new Error(`Could not get user profile: ${error.message}`)
  }

  if (!data) {
    throw new Error(
      'User profile not found. Run prompt-it register again or create a profile.'
    )
  }

  return data
}