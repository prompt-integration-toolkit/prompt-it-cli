import { Command } from 'commander'

import { registerGetCommand } from './commands/get.js'
import { registerInitCommand } from './commands/init.js'
import { registerLoginCommand } from './commands/accounts/login.js'
import { registerLogoutCommand } from './commands/accounts/logout.js'
import { registerMeCommand } from './commands/accounts/me.js'
import { registerPublishCommand } from './commands/publish.js'
import { registerRegisterCommand } from './commands/accounts/register.js'
import { registerSearchCommand } from './commands/search.js'
import { registerUsesCommand } from './commands/uses.js'

const program = new Command()

program
  .name('prompt-it')
  .description('Prompt-it CLI')
  .version('0.0.1')

registerInitCommand(program)
registerRegisterCommand(program)
registerLoginCommand(program)
registerLogoutCommand(program)
registerMeCommand(program)
registerPublishCommand(program)
registerGetCommand(program)
registerSearchCommand(program)
registerUsesCommand(program)

program
  .command('help')
  .description('Show help information.')
  .action(() => {
    program.help()
  })

program.parse()