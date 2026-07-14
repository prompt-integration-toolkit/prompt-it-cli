import chalk from 'chalk'
import { outro } from '@clack/prompts'

export const logger = {
  error: (message: string, err?: any) => {
    const text = message.startsWith('Error:') ? message : `Error: ${message}`
    console.log(chalk.red(text))
    // Could log err.stack in a verbose/debug mode, but omitting for standard output
  },

  validation: (message: string) => {
    console.log(chalk.red(message))
  },

  success: (message: string, endFlow: boolean = true) => {
    if (endFlow) {
      outro(chalk.green(message))
    } else {
      console.log(chalk.green(message))
    }
  },

  warn: (message: string, hint?: string) => {
    console.log(chalk.yellow(message))
    if (hint) {
      console.log(chalk.gray(hint))
    }
  },

  info: (message: string) => {
    console.log(message)
  },

  header: (title: string) => {
    console.log('')
    console.log(chalk.cyan(title))
    console.log(chalk.gray('-'.repeat(title.length)))
  },

  property: (key: string, value: string) => {
    console.log(`${chalk.bold(key)} ${value}`)
  },

  blank: () => {
    console.log('')
  }
}

export default logger
