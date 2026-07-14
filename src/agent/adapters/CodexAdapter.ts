import fs from 'fs';
import path from 'path';
import { AgentAdapter, InstallOptions, Prompt } from '../types/index.js';
import { getHomeDir } from '../utils/osPaths.js';

export class CodexAdapter implements AgentAdapter {
  readonly name = 'codex';
  readonly displayName = 'Codex';

  private getSkillDir(promptName: string): string {
    return path.join(getHomeDir(), '.codex', 'skills', promptName);
  }

  private getSkillFilePath(promptName: string): string {
    return path.join(this.getSkillDir(promptName), 'SKILL.md');
  }

  async isInstalled(promptName: string, options?: InstallOptions): Promise<boolean> {
    try {
      await fs.promises.access(this.getSkillFilePath(promptName));
      return true;
    } catch {
      return false;
    }
  }

  async install(prompt: Prompt, options?: InstallOptions): Promise<void> {
    const dir = this.getSkillDir(prompt.name);
    const filePath = this.getSkillFilePath(prompt.name);

    await fs.promises.mkdir(dir, { recursive: true });
    
    let content = '';
    if (prompt.description) {
      content += `# ${prompt.description}\n\n`;
    }
    content += `${prompt.content}\n\n<!-- Managed by Prompt-It -->\n`;

    await fs.promises.writeFile(filePath, content, 'utf-8');
  }

  async uninstall(promptName: string, options?: InstallOptions): Promise<void> {
    const dir = this.getSkillDir(promptName);
    await fs.promises.rm(dir, { recursive: true, force: true });
  }

  async listInstalled(): Promise<string[]> {
    const skillsDir = path.join(getHomeDir(), '.codex', 'skills');
    try {
      const entries = await fs.promises.readdir(skillsDir, { withFileTypes: true });
      const prompts: string[] = [];
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillFile = path.join(skillsDir, entry.name, 'SKILL.md');
          try {
            await fs.promises.access(skillFile);
            prompts.push(entry.name);
          } catch {
            // skip directories without SKILL.md
          }
        }
      }
      return prompts;
    } catch {
      return [];
    }
  }
}
