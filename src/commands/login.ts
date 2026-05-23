import chalk from 'chalk'
import { text, password, isCancel, cancel, outro } from '@clack/prompts'
import type { Command } from 'commander'

import { supabase } from '../services/supabase.js'
import { saveSession } from '../services/session.js'
import { isValidEmail } from '../utils/validators.js'

export function registerLoginCommand(program: Command): void {
  program
    .command('login')
    .description('Login into your Prompt-it account.')
    .action(async () => {
      try {
        const email = await text({
          message: 'Email:',
          validate(value) {
            if (!value) return 'Email is required.'
            if (!isValidEmail(value)) return 'Invalid email.'
          }
        })

        if (isCancel(email)) {
          cancel('Login cancelled.')
          return
        }

        const userPassword = await password({
          message: 'Password:',
          validate(value) {
            if (!value) return 'Password is required.'
          }
        })

        if (isCancel(userPassword)) {
          cancel('Login cancelled.')
          return
        }

        const { data, error } = await supabase.auth.signInWithPassword({
          email: String(email),
          password: String(userPassword)
        })

        if (error) {
          console.log(chalk.red(`Error: ${error.message}`))
          return
        }

        if (!data.session || !data.user) {
          console.log(chalk.red('Login failed. No session was returned.'))
          return
        }

        await saveSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          user: {
            id: data.user.id,
            email: data.user.email
          }
        })

        outro(chalk.green('Logged in successfully.'))
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unexpected error occurred.'

        console.log(chalk.red(`Error: ${message}`))
      }
    })
}