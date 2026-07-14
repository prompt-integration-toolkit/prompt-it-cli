import { AgentAdapter } from './types/index.js';
import { ClaudeAdapter } from './adapters/ClaudeAdapter.js';
import { CodexAdapter } from './adapters/CodexAdapter.js';
import { AntigravityAdapter } from './adapters/AntigravityAdapter.js';

export class AgentManager {
  static getAdapter(agentName: string): AgentAdapter {
    switch (agentName.toLowerCase()) {
      case 'claude':
        return new ClaudeAdapter();
      case 'codex':
        return new CodexAdapter();
      case 'antigravity':
        return new AntigravityAdapter();
      default:
        throw new Error(`Unsupported agent: ${agentName}`);
    }
  }
}
