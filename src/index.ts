import { Command } from 'commander'
import { registerGetCommand } from './commands/get.js'
import { registerRegisterCommand } from './commands/accounts/register.js'
import { registerLoginCommand } from './commands/accounts/login.js'
import { registerMeCommand } from './commands/accounts/me.js'
import { registerLogoutCommand } from './commands/accounts/logout.js'
import { registerInitCommand } from './commands/init.js'
import { registerPublishCommand } from './commands/publish.js'

const program = new Command()

program
  .name('prompt-it')
  .description('CLI tool for storing, organizing, versioning, and reusing prompts.')
  .version('0.1.0')

registerGetCommand(program)
registerRegisterCommand(program)
registerLoginCommand(program)
registerMeCommand(program)
registerLogoutCommand(program)
registerInitCommand(program)
registerPublishCommand(program)

program
  .command('help')
  .description('Show help information.')
  .action(() => {
    program.help()
  })

program.parse(process.argv)