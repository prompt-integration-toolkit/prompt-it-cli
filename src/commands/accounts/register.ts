import logger from '../../utils/logger.js'
import chalk from 'chalk'
import { promptText, promptPassword, promptConfirm, outro } from '../../utils/prompts.js'
import type { Command } from 'commander'

import { supabase } from '../../services/supabase.js'
import { isValidEmail, isValidUsername } from '../../utils/validators.js'
import { saveSession } from '../../services/session.js'

export function registerRegisterCommand(program: Command): void {
  program
    .command('register')
    .description('Create a new Prompt-it account.')
    .action(async () => {
      try {
        const email = await promptText({
          message: 'Email:',
          validate(value) {
            if (!value) return 'Email is required.'
            if (!isValidEmail(value)) return 'Invalid email.'
          }
        })

        const userPassword = await promptPassword({
          message: 'Password:',
          validate(value) {
            if (!value) return 'Password is required.'
            if (value.length < 6) {
              return 'Password must have at least 6 characters.'
            }
          }
        })

        await promptPassword({
          message: 'Confirm password:',
          validate(value) {
            if (!value) return 'Password confirmation is required.'
            if (value !== userPassword) {
              return 'Passwords do not match.'
            }
          }
        })

        const username = await promptText({
          message: 'Username:',
          validate(value) {
            if (!value) return 'Username is required.'
            if (!isValidUsername(value)) {
              return 'Use 3-30 chars: letters, numbers, _ or - only.'
            }
          }
        })

        const usernameTaken = await usernameAlreadyExists(String(username))

        if (usernameTaken) {
          logger.error('This username is already taken. Choose another one.')
          return
        }

        const shouldCreate = await promptConfirm({
          message: `Create account for ${String(email)} with username ${String(username)}?`,
          initialValue: true
        })

        if (!shouldCreate) {
          return
        }

        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: String(email),
          password: String(userPassword)
        })

        if (signUpError) {
          logger.error(`Error: ${signUpError.message}`)
          return
        }

        const userId = signUpData.user?.id

        if (!userId) {
          logger.warn(
            'Account created, but user ID was not returned. Check if email confirmation is enabled.'
          )
          return
        }

        const { error: profileError } = await supabase.from('profiles').insert({
          id: userId,
          username: String(username),
          display_name: String(username)
        })

        if (profileError) {
          logger.error(`Profile error: ${profileError.message}`)
          return
        }

        if (signUpData.session && signUpData.user) {
          await saveSession({
            access_token: signUpData.session.access_token,
            refresh_token: signUpData.session.refresh_token,
            user: {
              id: signUpData.user.id,
              email: signUpData.user.email ?? undefined
            }
          })

          logger.success(`Account created and logged in as ${String(username)}.`, true)
          return
        }

        outro(chalk.yellow('Account created. Please confirm your email before logging in.'))
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unexpected error occurred.'

        logger.error(`Error: ${message}`)
      }
    })
}

async function usernameAlreadyExists(username: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('profiles')
    .select('username')
    .eq('username', username)
    .maybeSingle()

  if (error) {
    throw new Error(`Could not verify username: ${error.message}`)
  }

  return Boolean(data)
}
