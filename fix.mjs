import fs from 'fs';

function replaceInFile(file, replacements) {
  let content = fs.readFileSync(file, 'utf-8');
  for (const [search, replace] of replacements) {
    content = content.replace(search, replace);
  }
  fs.writeFileSync(file, content, 'utf-8');
}

// 1. Adapters (Disable eslint for _options)
const adapters = ['AntigravityAdapter.ts', 'ClaudeAdapter.ts', 'CodexAdapter.ts'];
for (const adapter of adapters) {
  replaceInFile(`src/agent/adapters/${adapter}`, [
    [/_options\?: InstallOptions/g, '/* eslint-disable-next-line @typescript-eslint/no-unused-vars */ _options?: InstallOptions']
  ]);
}

// 2. Logger (Disable eslint for _err)
replaceInFile('src/utils/logger.ts', [
  [/_err\?: unknown/g, '/* eslint-disable-next-line @typescript-eslint/no-unused-vars */ _err?: unknown']
]);

// 3. Remove unused outro
const files = [
  'src/commands/accounts/me.ts',
  'src/commands/accounts/login.ts',
  'src/commands/accounts/logout.ts',
  'src/commands/search.ts',
  'src/commands/init.ts',
  'src/commands/get.ts',
  'src/commands/publish.ts',
  'src/commands/revoke.ts'
];

for (const file of files) {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf-8');
    content = content.replace(/, outro/g, '');
    content = content.replace(/outro, /g, '');
    content = content.replace(/import \{ outro \} from '@clack\/prompts'\n/, '');
    fs.writeFileSync(file, content, 'utf-8');
  }
}
