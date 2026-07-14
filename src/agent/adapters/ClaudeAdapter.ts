import fs from 'fs';
import path from 'path';
import { AgentAdapter, InstallOptions, Prompt } from '../types/index.js';
import { getHomeDir, PROMPT_IT_SIGNATURE } from '../utils/osPaths.js';

export class ClaudeAdapter implements AgentAdapter {
  readonly name = 'claude';
  readonly displayName = 'Claude Code';

  private getSkillDir(promptName: string): string {
    return path.join(getHomeDir(), '.claude', 'skills', promptName);
  }

  private getSkillFilePath(promptName: string): string {
    return path.join(this.getSkillDir(promptName), 'SKILL.md');
  }

  private async hasSignature(filePath: string): Promise<boolean> {
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      return content.includes(PROMPT_IT_SIGNATURE);
    } catch {
      return false;
    }
  }

  async isInstalled(promptName: string, _options?: InstallOptions): Promise<boolean> {
    return this.hasSignature(this.getSkillFilePath(promptName));
  }

  async install(prompt: Prompt, _options?: InstallOptions): Promise<void> {
    const dir = this.getSkillDir(prompt.name);
    const filePath = this.getSkillFilePath(prompt.name);

    await fs.promises.mkdir(dir, { recursive: true });
    
    let content = '';
    if (prompt.description) {
      content += `# ${prompt.description}\n\n`;
    }
    content += `${prompt.content}\n\n${PROMPT_IT_SIGNATURE}\n`;

    await fs.promises.writeFile(filePath, content, 'utf-8');
  }

  async uninstall(promptName: string, _options?: InstallOptions): Promise<void> {
    const dir = this.getSkillDir(promptName);
    await fs.promises.rm(dir, { recursive: true, force: true });
  }

  async listInstalled(): Promise<string[]> {
    const skillsDir = path.join(getHomeDir(), '.claude', 'skills');
    try {
      const entries = await fs.promises.readdir(skillsDir, { withFileTypes: true });
      const prompts: string[] = [];
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillFile = path.join(skillsDir, entry.name, 'SKILL.md');
          if (await this.hasSignature(skillFile)) {
            prompts.push(entry.name);
          }
        }
      }
      return prompts;
    } catch {
      return [];
    }
  }
}
