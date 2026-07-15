import { describe, it, expect } from 'vitest'
import { AgentManager } from '../src/agent/AgentManager.js'
import { ClaudeAdapter } from '../src/agent/adapters/ClaudeAdapter.js'
import { CodexAdapter } from '../src/agent/adapters/CodexAdapter.js'
import { AntigravityAdapter } from '../src/agent/adapters/AntigravityAdapter.js'

describe('AgentManager.getAdapter', () => {
  it('returns ClaudeAdapter for "claude"', () => {
    const adapter = AgentManager.getAdapter('claude')
    expect(adapter).toBeInstanceOf(ClaudeAdapter)
  })

  it('returns CodexAdapter for "codex"', () => {
    const adapter = AgentManager.getAdapter('codex')
    expect(adapter).toBeInstanceOf(CodexAdapter)
  })

  it('returns AntigravityAdapter for "antigravity"', () => {
    const adapter = AgentManager.getAdapter('antigravity')
    expect(adapter).toBeInstanceOf(AntigravityAdapter)
  })

  it('is case-insensitive — "CLAUDE" returns ClaudeAdapter', () => {
    const adapter = AgentManager.getAdapter('CLAUDE')
    expect(adapter).toBeInstanceOf(ClaudeAdapter)
  })

  it('is case-insensitive — "Claude" returns ClaudeAdapter', () => {
    const adapter = AgentManager.getAdapter('Claude')
    expect(adapter).toBeInstanceOf(ClaudeAdapter)
  })

  it('throws for unsupported agent name', () => {
    expect(() => AgentManager.getAdapter('chatgpt')).toThrow('Unsupported agent: chatgpt')
  })

  it('throws for empty string', () => {
    expect(() => AgentManager.getAdapter('')).toThrow('Unsupported agent: ')
  })
})

describe('AgentManager.getAllAdapters', () => {
  it('returns array with exactly 3 adapters', () => {
    const adapters = AgentManager.getAllAdapters()
    expect(adapters).toHaveLength(3)
  })

  it('contains one instance of each adapter type', () => {
    const adapters = AgentManager.getAllAdapters()

    const hasClaudeAdapter = adapters.some((a) => a instanceof ClaudeAdapter)
    const hasCodexAdapter = adapters.some((a) => a instanceof CodexAdapter)
    const hasAntigravityAdapter = adapters.some((a) => a instanceof AntigravityAdapter)

    expect(hasClaudeAdapter).toBe(true)
    expect(hasCodexAdapter).toBe(true)
    expect(hasAntigravityAdapter).toBe(true)
  })
})
