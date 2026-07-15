import { describe, it, expect } from 'vitest'
import { getHomeDir, PROMPT_IT_SIGNATURE } from '../src/agent/utils/osPaths.js'

describe('getHomeDir', () => {
  it('returns a non-empty string', () => {
    const home = getHomeDir()

    expect(typeof home).toBe('string')
    expect(home.length).toBeGreaterThan(0)
  })
})

describe('PROMPT_IT_SIGNATURE', () => {
  it('contains the expected marker string', () => {
    expect(PROMPT_IT_SIGNATURE).toBe('<!-- Managed by Prompt-It -->')
  })
})
