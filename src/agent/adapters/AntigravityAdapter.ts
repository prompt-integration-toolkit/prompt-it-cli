import fs from 'fs';
import path from 'path';
import { AgentAdapter, InstallOptions, Prompt } from '../types/index.js';
import { getHomeDir, PROMPT_IT_SIGNATURE } from '../utils/osPaths.js';

export class AntigravityAdapter implements AgentAdapter {
  readonly name = 'antigravity';
  readonly displayName = 'Antigravity IDE';

  private getKIDir(promptName: string): string {
    return path.join(getHomeDir(), '.gemini', 'antigravity', 'knowledge', promptName);
  }

  private getMetadataFilePath(promptName: string): string {
    return path.join(this.getKIDir(promptName), 'metadata.json');
  }
  
  private getArtifactsDir(promptName: string): string {
    return path.join(this.getKIDir(promptName), 'artifacts');
  }

  private getPromptFilePath(promptName: string): string {
    return path.join(this.getArtifactsDir(promptName), `${promptName}.md`);
  }

  private async hasSignature(promptName: string): Promise<boolean> {
    try {
      const content = await fs.promises.readFile(this.getPromptFilePath(promptName), 'utf-8');
      return content.includes(PROMPT_IT_SIGNATURE);
    } catch {
      return false;
    }
  }

  async isInstalled(promptName: string, _options?: InstallOptions): Promise<boolean> {
    return this.hasSignature(promptName);
  }

  async install(prompt: Prompt, _options?: InstallOptions): Promise<void> {
    const artifactsDir = this.getArtifactsDir(prompt.name);
    const metadataPath = this.getMetadataFilePath(prompt.name);
    const promptPath = this.getPromptFilePath(prompt.name);

    await fs.promises.mkdir(artifactsDir, { recursive: true });
    
    // Write metadata.json
    const metadata = {
      title: prompt.name,
      summary: prompt.description || prompt.name
    };
    await fs.promises.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');

    // Write prompt content to artifacts
    const content = `${prompt.content}\n\n${PROMPT_IT_SIGNATURE}\n`;
    await fs.promises.writeFile(promptPath, content, 'utf-8');
  }

  async uninstall(promptName: string, _options?: InstallOptions): Promise<void> {
    const dir = this.getKIDir(promptName);
    await fs.promises.rm(dir, { recursive: true, force: true });
  }

  async listInstalled(): Promise<string[]> {
    const knowledgeDir = path.join(getHomeDir(), '.gemini', 'antigravity', 'knowledge');
    try {
      const entries = await fs.promises.readdir(knowledgeDir, { withFileTypes: true });
      const prompts: string[] = [];
      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (await this.hasSignature(entry.name)) {
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
