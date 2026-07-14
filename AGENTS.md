# Instructions for AI Agents (AGENTS.md)

This document defines the architectural rules and code style for the `prompt-it-cli` project. All AI agents must strictly follow these rules before adding, altering, or refactoring any code.

---

## 1. Project Context

**What is `prompt-it-cli`?**
`prompt-it-cli` is a command-line tool designed for storing, organizing, versioning, and reusing prompts. It acts as a package manager for prompts, allowing users to publish their prompts to a central Supabase database and retrieve them globally into their workspaces or tools.

**How it works:**
- **Authentication:** Users authenticate via a Supabase backend.
- **Commands:** The CLI uses `commander` to handle commands like `init`, `publish`, `get`, `list`, `revoke`, `delete`, and more.
- **Storage:** Prompts are stored in Supabase with strict versioning support (e.g., `1.0.0`, `1.0.1`), soft-delete mechanisms, and relational mapping to user profiles.
- **Terminal UI:** It relies heavily on `@clack/prompts` for interactive terminal prompts and `chalk` for colored outputs, which are wrapped in centralized utilities to maintain consistency.

---

## 2. Terminal Outputs (Mandatory Logger)

We use a unified terminal abstraction to guarantee consistent colors, prefixes, and flows across all commands.

**RULE:**
NEVER use `console.log(chalk...)` directly. Any terminal output must go through the project's logger utility:
`import logger from '../utils/logger.js'`

**Available Logger Methods:**
- `logger.error(message: string, error?: any)`: Logs failures. It automatically prepends `Error:` and colors the text red.
- `logger.validation(message: string)`: Use EXCLUSIVELY for simple validation errors (e.g., missing file, invalid input) in red, without the "Error:" prefix or stacktraces.
- `logger.success(message: string, endFlow?: boolean)`: Ends executions successfully. By default, `endFlow` is true and will gracefully close the prompt interface with a green message using clack's `outro`.
- `logger.warn(message: string, hint?: string)`: Prints warnings in yellow, with an optional hint in gray below.
- `logger.header(title: string)`: Prints a cyan header with a dashed underline.
- `logger.property(key: string, value: string)`: Prints a bold key followed by its value.
- `logger.blank()`: Prints an empty line.

---

## 3. Terminal Inputs and Interactions

User interactions rely on `@clack/prompts`. To handle `Ctrl + C` cancellations gracefully and globally, we wrap these inputs.

**RULE:**
NEVER import native input functions directly from `@clack/prompts` (like `text`, `confirm`, `select`).
ALWAYS use the prompt wrappers provided in the utility module:
`import { promptText, promptConfirm, promptSelect } from '../utils/prompts.js'`

These functions automatically cancel the flow and exit the process if the user aborts.

Example:
```typescript
import { promptText } from '../utils/prompts.js'

const email = await promptText({ message: 'Enter your email:' })
```

---

## 4. Global Error Handling

**RULE:**
All main commands must wrap their execution in a global `try / catch` block. Errors caught at this level must be displayed via `logger.error` and subsequently terminate the application.

```typescript
import logger from '../utils/logger.js'

export async function myCommand() {
  try {
    // Execution logic
  } catch (error: any) {
    logger.error(error.message, error)
    process.exit(1)
  }
}
```

---

## 5. Supabase Queries

**RULE:**
Keep the Supabase API usage clean by immediately destructing the `{ data, error }` response. Do not use heavy ORM abstractions. Evaluate `if (error)` immediately after the query and throw descriptive exceptions.

```typescript
const { data, error } = await supabase.from('...').select('...')
if (error) {
  throw new Error(`Friendly error description: ${error.message}`)
}
```

---

## 6. GitHub CLI and Contributions

**RULE:**
Whenever performing repository operations via the GitHub CLI (such as opening Pull Requests or creating issues), you MUST read and strictly adhere to the established templates and patterns located in the `.github` directory (e.g., `PULL_REQUEST_TEMPLATE.md` or issue templates). Do not use generic descriptions; always format your PRs and commits according to the project's standardized structure.

---

## 7. Pre-commit CI Checks

**RULE:**
Before committing any changes or declaring a feature complete, you MUST run the project's local CI checks (`npm run build`, `npm run lint`, `npm run test`). 
If any tests fail and the errors pose a risk to the project's progress or future stability, you MUST NOT commit the code. Instead, halt your current process, clearly notify the USER of the exact errors, and ask for permission to proceed with fixing them.
