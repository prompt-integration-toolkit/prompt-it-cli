import { Command } from 'commander'
import { registerGetCommand } from './commands/get.js'
import { registerRegisterCommand } from './commands/register.js'
import { registerLoginCommand } from './commands/login.js'
import { registerMeCommand } from './commands/me.js'

const program = new Command()

program
  .name('prompt-it')
  .description('CLI tool for storing, organizing, versioning, and reusing prompts.')
  .version('0.1.0')

registerGetCommand(program)
registerRegisterCommand(program)
registerLoginCommand(program)
registerMeCommand(program)

program
  .command('help')
  .description('Show help information.')
  .action(() => {
    program.help()
  })

program.parse(process.argv)