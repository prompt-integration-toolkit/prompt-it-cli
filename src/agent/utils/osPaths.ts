import os from 'os';

export const getHomeDir = (): string => os.homedir();

export const PROMPT_IT_SIGNATURE = '<!-- Managed by Prompt-It -->';
