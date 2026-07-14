export interface Prompt {
  name: string;
  content: string;
  description?: string;
  version?: string;
}

export interface InstallOptions {
  force?: boolean;
}

export interface AgentAdapter {
  readonly name: string;
  install(prompt: Prompt, options?: InstallOptions): Promise<void>;
  uninstall(promptName: string, options?: InstallOptions): Promise<void>;
  isInstalled(promptName: string, options?: InstallOptions): Promise<boolean>;
}
