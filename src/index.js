import { Command } from 'commander'
import { registerGetCommand } from './commands/get.js'

const program = new Command()

program
  .name('prompt-it')
  .description('CLI tool for storing, organizing, versioning, and reusing prompts.')
  .version('0.1.0')

registerGetCommand(program)

program.parse(process.argv)