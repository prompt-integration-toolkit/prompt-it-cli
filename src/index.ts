import { Command } from 'commander'

import { registerDeleteCommand } from './commands/delete.js'
import { registerGetCommand } from './commands/get.js'
import { registerInitCommand } from './commands/init.js'
import { registerLoginCommand } from './commands/accounts/login.js'
import { registerLogoutCommand } from './commands/accounts/logout.js'
import { registerMeCommand } from './commands/accounts/me.js'
import { registerPublishCommand } from './commands/publish.js'
import { registerRegisterCommand } from './commands/accounts/register.js'
import { registerSearchCommand } from './commands/search.js'
import { registerUsesCommand } from './commands/uses.js'
import { registerListCommand } from './commands/list.js'
import { registerRevokeCommand } from './commands/revoke.js'
import { registerAgentCommand } from './commands/agent.js'

const program = new Command()

program.name('prompt-it').description('Prompt-it CLI').version('0.1.0')

registerInitCommand(program)
registerRegisterCommand(program)
registerLoginCommand(program)
registerLogoutCommand(program)
registerMeCommand(program)
registerPublishCommand(program)
registerDeleteCommand(program)
registerGetCommand(program)
registerSearchCommand(program)
registerUsesCommand(program)
registerListCommand(program)
registerRevokeCommand(program)
registerAgentCommand(program)

program
  .command('help')
  .description('Show help information.')
  .action(() => {
    program.help()
  })

program.parse()
