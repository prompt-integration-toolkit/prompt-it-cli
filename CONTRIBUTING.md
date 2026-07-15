# Contributing to Prompt Integration Toolkit CLI

First off, thanks for taking the time to contribute! 🎉 

The Prompt Integration Toolkit ecosystem, abbreviated as Prompt-it, thrives on community contributions. Whether you're fixing a bug, proposing a new feature, or improving the documentation, your help is incredibly valuable to us.

## Code of Conduct

This project and everyone participating in it is governed by the [Prompt Integration Toolkit Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. If you experience unacceptable behavior, please report it to `promptit.dev@gmail.com`.

## How Can I Contribute?

### Reporting Bugs
If you find a bug, please create an issue on GitHub. Include as much detail as possible: steps to reproduce, expected behavior, what actually happened, and any relevant logs or screenshots. 

### Suggesting Features
Got a cool idea? We'd love to hear it! Open an issue to discuss your proposal before writing any code. This ensures your feature aligns with the project's roadmap and saves you from doing duplicate work. Look for issues labeled `help wanted` or `good first issue` if you're looking for inspiration.

### Submitting Code Changes
**Please open an issue to discuss your changes before opening a Pull Request.** This helps us keep track of what's being worked on and prevents multiple people from tackling the same thing simultaneously.

### Translations
Want to translate documentation or CLI messages? You **do not** need to open an issue first! Feel free to open a Pull Request directly and just add the `translations` label to it.

---

## Getting Started

### Prerequisites
Before you begin, ensure you have the following installed:
- [Node.js](https://nodejs.org/) (v18 or higher)
- npm (v9 or higher)
- Git

### Fork & Clone
1. Fork the repository on GitHub.
2. Clone your fork locally:
   ```bash
   git clone https://github.com/YOUR-USERNAME/prompt-it-cli.git
   cd prompt-it-cli
   ```

### Install Dependencies
Run the following command to install all necessary packages:
```bash
npm install
```

### Environment Setup
The CLI requires a connection to a Supabase database to function correctly (for user sessions, prompts, etc.). 

1. Create a `.env` file in the root of the project:
   ```bash
   touch .env
   ```
2. Add the following environment variables to your `.env` file:
   ```env
   SUPABASE_URL=your_supabase_url
   SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

**Where do I get these credentials?**
You have two options to set up your development database:
- **Option 1 (Local):** Use the Supabase CLI to spin up a local instance. Run `npx supabase start` in your terminal. It will output local API URLs and anon keys for you to use.
- **Option 2 (Cloud):** Create a free project on [supabase.com](https://supabase.com/), go to Project Settings -> API, and copy your URL and anon key.

### Build & Run Locally
To compile the TypeScript code into the `dist/` directory:
```bash
npm run build
```

To run the CLI locally (this executes the compiled output or uses `ts-node`/`esbuild` depending on the current dev script):
```bash
npm run dev
# or
npm start
```

---

## Development Guidelines

### Project Structure
- `src/commands/`: Contains the logic for all CLI commands (e.g., publish, get, search).
- `src/services/`: Modules handling external I/O (Supabase integration, local session storage).
- `src/utils/`: Pure functions and helpers (parsing, validations, semver logic).

### Branch Naming
Please follow the `type/descriptive-name` convention for your branches:
- `feat/add-search-filters`
- `fix/login-timeout`
- `docs/update-readme`

### Commit Messages
We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification. This helps us generate changelogs automatically. 
Valid prefixes include: `feat`, `fix`, `docs`, `refactor`, `chore`, `test`, `style`, `perf`, `ci`, `build`.
Example: `feat: add support for pagination in search command`

### Code Style
We use **ESLint** and **Prettier** to enforce code consistency. 
Before committing, make sure your code follows the standard:
```bash
npm run format      # Formats your code using Prettier
npm run lint:fix    # Fixes auto-correctable ESLint issues
```

### Tests
We use **Vitest** for unit testing. Our core utilities (in `src/utils/`) should have high coverage since they contain pure logic.
If you are adding new utility functions or modifying existing ones, please add or update the corresponding tests.

To run tests:
```bash
npm run test
```

---

## Pull Request Process

1. **Check if an issue exists:** Unless it's a translation PR, ensure there's an open issue discussing your changes.
2. **Sync your fork:** Make sure your branch is up to date with the `main` branch.
3. **Checklist before submitting:**
   - [ ] The code compiles successfully (`npm run build`).
   - [ ] There are no linting errors (`npm run lint`).
   - [ ] All unit tests pass (`npm run test`).
   - [ ] The commit messages follow Conventional Commits.
4. **Open the PR:** Fill out the PR template (if one exists) and link the issue it resolves using keywords like `Fixes #123` or `Resolves #456`.
5. **Review:** Maintainers will review your PR. We might request some changes, so keep an eye on your GitHub notifications!

## Community & Contact
If you have any questions, need help setting up your environment, or just want to chat about the project, feel free to reach out at `promptit.dev@gmail.com`.

Happy coding! 💻🚀
