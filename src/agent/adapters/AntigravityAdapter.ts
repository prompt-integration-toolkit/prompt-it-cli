import fs from 'fs';
import path from 'path';
import { AgentAdapter, InstallOptions, Prompt } from '../types/index.js';
import { getHomeDir } from '../utils/osPaths.js';

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

  async isInstalled(promptName: string, options?: InstallOptions): Promise<boolean> {
    try {
      await fs.promises.access(this.getMetadataFilePath(promptName));
      return true;
    } catch {
      return false;
    }
  }

  async install(prompt: Prompt, options?: InstallOptions): Promise<void> {
    const dir = this.getKIDir(prompt.name);
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
    let content = `${prompt.content}\n\n<!-- Managed by Prompt-It -->\n`;
    await fs.promises.writeFile(promptPath, content, 'utf-8');
  }

  async uninstall(promptName: string, options?: InstallOptions): Promise<void> {
    const dir = this.getKIDir(promptName);
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
}
