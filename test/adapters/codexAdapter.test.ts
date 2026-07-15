import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'fs'
import { CodexAdapter } from '../../src/agent/adapters/CodexAdapter.js'
import { PROMPT_IT_SIGNATURE } from '../../src/agent/utils/osPaths.js'
import type { Prompt } from '../../src/agent/types/index.js'

vi.mock('fs', () => ({
  default: {
    promises: {
      readFile: vi.fn(),
      writeFile: vi.fn(),
      mkdir: vi.fn(),
      rm: vi.fn(),
      readdir: vi.fn(),
    }
  }
}))

vi.mock('../../src/agent/utils/osPaths.js', () => ({
  getHomeDir: () => '/fake/home',
  PROMPT_IT_SIGNATURE: '<!-- Managed by Prompt-It -->'
}))

const adapter = new CodexAdapter()

const mockPrompt: Prompt = {
  name: 'test-prompt',
  content: 'You are a helpful assistant.',
  description: 'A test prompt'
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('CodexAdapter.install', () => {
  it('creates directory recursively', async () => {
    await adapter.install(mockPrompt)

    expect(fs.promises.mkdir).toHaveBeenCalledWith(
      '/fake/home/.codex/skills/test-prompt',
      { recursive: true }
    )
  })

  it('writes file with prompt content and signature', async () => {
    await adapter.install(mockPrompt)

    const writtenContent = vi.mocked(fs.promises.writeFile).mock.calls[0][1] as string
    expect(writtenContent).toContain('You are a helpful assistant.')
    expect(writtenContent).toContain(PROMPT_IT_SIGNATURE)
  })

  it('writes to correct file path', async () => {
    await adapter.install(mockPrompt)

    expect(fs.promises.writeFile).toHaveBeenCalledWith(
      '/fake/home/.codex/skills/test-prompt/SKILL.md',
      expect.any(String),
      'utf-8'
    )
  })

  it('includes description header when provided', async () => {
    await adapter.install(mockPrompt)

    const writtenContent = vi.mocked(fs.promises.writeFile).mock.calls[0][1] as string
    expect(writtenContent).toContain('# A test prompt')
  })

  it('omits description header when not provided', async () => {
    const promptWithoutDesc: Prompt = { name: 'no-desc', content: 'content only' }
    await adapter.install(promptWithoutDesc)

    const writtenContent = vi.mocked(fs.promises.writeFile).mock.calls[0][1] as string
    expect(writtenContent).not.toContain('# ')
    expect(writtenContent).toContain('content only')
  })
})

describe('CodexAdapter.uninstall', () => {
  it('removes directory with force and recursive flags', async () => {
    await adapter.uninstall('test-prompt')

    expect(fs.promises.rm).toHaveBeenCalledWith(
      '/fake/home/.codex/skills/test-prompt',
      { recursive: true, force: true }
    )
  })

  it('does not throw when directory does not exist', async () => {
    vi.mocked(fs.promises.rm).mockResolvedValue(undefined)

    await expect(adapter.uninstall('nonexistent')).resolves.not.toThrow()
  })
})

describe('CodexAdapter.isInstalled', () => {
  it('returns true when file exists and has signature', async () => {
    vi.mocked(fs.promises.readFile).mockResolvedValue(`Some content\n${PROMPT_IT_SIGNATURE}\n`)

    const result = await adapter.isInstalled('test-prompt')
    expect(result).toBe(true)
  })

  it('returns false when file exists without signature', async () => {
    vi.mocked(fs.promises.readFile).mockResolvedValue('Some content without signature')

    const result = await adapter.isInstalled('test-prompt')
    expect(result).toBe(false)
  })

  it('returns false when file does not exist', async () => {
    vi.mocked(fs.promises.readFile).mockRejectedValue(new Error('ENOENT'))

    const result = await adapter.isInstalled('test-prompt')
    expect(result).toBe(false)
  })
})

describe('CodexAdapter.listInstalled', () => {
  it('returns names of directories with signed files', async () => {
    vi.mocked(fs.promises.readdir).mockResolvedValue([
      { name: 'prompt-a', isDirectory: () => true },
      { name: 'prompt-b', isDirectory: () => true },
    ] as any)

    vi.mocked(fs.promises.readFile).mockResolvedValue(`content\n${PROMPT_IT_SIGNATURE}\n`)

    const result = await adapter.listInstalled()
    expect(result).toEqual(['prompt-a', 'prompt-b'])
  })

  it('excludes directories without signature', async () => {
    vi.mocked(fs.promises.readdir).mockResolvedValue([
      { name: 'signed', isDirectory: () => true },
      { name: 'unsigned', isDirectory: () => true },
    ] as any)

    vi.mocked(fs.promises.readFile)
      .mockResolvedValueOnce(`content\n${PROMPT_IT_SIGNATURE}\n`)
      .mockResolvedValueOnce('no signature here')

    const result = await adapter.listInstalled()
    expect(result).toEqual(['signed'])
  })

  it('returns empty array when skills directory is empty', async () => {
    vi.mocked(fs.promises.readdir).mockResolvedValue([])

    const result = await adapter.listInstalled()
    expect(result).toEqual([])
  })

  it('returns empty array when skills directory does not exist', async () => {
    vi.mocked(fs.promises.readdir).mockRejectedValue(new Error('ENOENT'))

    const result = await adapter.listInstalled()
    expect(result).toEqual([])
  })
})
