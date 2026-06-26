# ![Prompt-It CLI](https://img.shields.io/badge/Prompt--It_CLI-Official_Documentation-10b981?style=for-the-badge&logo=gnubash&logoColor=white)

![Node](https://img.shields.io/badge/Environment-Node.js-339933?style=flat-square&logo=nodedotjs&logoColor=white) ![CLI](https://img.shields.io/badge/Interface-CLI-4b5563?style=flat-square&logo=terminal&logoColor=white) ![Status](https://img.shields.io/badge/Status-Active-success?style=flat-square)

Welcome to the official documentation for the **Prompt-It CLI**! This command-line tool was built to easily create, manage, publish, and search for incredible Artificial Intelligence prompts.

Here you will find everything you need to know to use the CLI in your workflow.

---

## ![Getting Started](https://img.shields.io/badge/Getting_Started-3b82f6?style=for-the-badge)

To execute commands, use `prompt-it` followed by the desired action. To view help for any command directly in the terminal, simply run:

```bash
prompt-it help
```

---

## ![Available Commands](https://img.shields.io/badge/Available_Commands-8b5cf6?style=for-the-badge)

The CLI is divided into three main usage categories: **Authentication**, **Prompt Management**, and **Search/Consumption**.

### ![Accounts & Authentication](https://img.shields.io/badge/1.-Accounts_%26_Authentication-ec4899?style=flat-square)

To interact with the platform's publishing features, you need to be authenticated with your account.

* `prompt-it register`
  Creates a new Prompt-It account through an interactive flow.

* `prompt-it login`
  Logs into your Prompt-It account to authorize the publishing of new prompts.

* `prompt-it logout`
  Securely ends your current session.

* `prompt-it me`
  Displays the details of the currently authenticated user.

* `prompt-it uses`
  Shows statistics for your current platform usage, such as total published posts and versions sent compared to your limit.

---

### ![Prompt Management & Publishing](https://img.shields.io/badge/2.-Prompt_Management_%26_Publishing-f59e0b?style=flat-square)

These commands allow you to initialize new prompt projects, publish them, and keep them updated on the Prompt-It cloud.

* `prompt-it init`
  Generates a template `prompt-details.json` file in your current directory. This file will be used to store essential metadata for your prompt (title, description, version, and tags).

* `prompt-it publish`
  Publishes a new prompt to the platform. The command can automatically read the `prompt-details.json` file in the current directory, or you can pass options via the command line.
  * **Options**:
    * `--name <name>`: Defines the unique name (slug) of the prompt.
    * `--title <title>`: A user-friendly title for the prompt.
    * `--description <description>`: A detailed description of its purpose.
    * `--tags <tags>`: A comma-separated list of tags for categorization (e.g., `code,review,ai`).

* `prompt-it update`
  Updates the content or metadata of your prompt that is already published on the platform, creating a new version linked to it.
  * **Options**:
    * The same creation options (`--name`, `--title`, `--description`, `--tags`).
    * `--message <message>`: A commit message briefly indicating what changed in this new version.

* `prompt-it delete`
  Permanently deletes a prompt you own. You also have the flexibility to delete a specific version from the prompt's history using the `@version` format (e.g., `prompt-it delete my-prompt@1.0.1`).

---

### ![Search & Consumption](https://img.shields.io/badge/3.-Search_%26_Consumption-06b6d4?style=flat-square)

Tools for exploring public content created by the community and integrating them into your environment.

* `prompt-it search`
  Performs a paginated search across all public prompts on the platform using the provided term. The search covers fields like name, title, description, and username.
  * **Options**:
    * `--users`: Changes the search scope to look exclusively for user profiles instead of prompt content.

* `prompt-it get`
  Displays, copies, or downloads a community prompt. If executed without options, the CLI will open an interactive menu with actions to take.
  * **Parameters**:
    * `<promptRef>`: The prompt reference in the format `username/prompt-name`. You can specify a desired version by appending `@version` (e.g., `miguel/test@1.0.1`).
    * `[action]` *(Optional)*: If set to `details`, instead of getting the prompt content, the CLI will attempt to create a `prompt-details.json` based on its information.
  * **Options**:
    * `--copy`: Copies the prompt's text content directly to your system's clipboard.
    * `--file`: Saves the entire prompt content inside a local Markdown (`.md`) file.

---

## ![Recommended Workflow](https://img.shields.io/badge/Recommended_Workflow-14b8a6?style=for-the-badge)

If you are new to the **Prompt-It** ecosystem, here is the ideal path to build and share your first prompt with the community:

1. **Initialize the project**: In a new folder, run `prompt-it init`. The vital `prompt-details.json` file will be created.
2. **Write your prompt**: Create a markdown file (e.g., `my-prompt.md`) and write the guidelines or instructions for the AI.
3. **Configure the details**: Open `prompt-details.json`, modify the name, title, description, fill in relevant tags, and set `prompt-file` to your `.md` file name.
4. **Publish to the cloud**: Ensure you are logged in (`prompt-it login`) and, in the same directory, run `prompt-it publish`. The tool will validate the info and send the first public version of your prompt.
5. **Update consistently**: Whenever you refine the content in your `.md`, just run `prompt-it update` with the flag `--message "Added support for new languages"`. Versioning will be handled automatically (like a git diff)!
