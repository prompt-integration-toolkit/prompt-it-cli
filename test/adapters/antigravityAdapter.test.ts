import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'fs'
import { AntigravityAdapter } from '../../src/agent/adapters/AntigravityAdapter.js'
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

const adapter = new AntigravityAdapter()

const mockPrompt: Prompt = {
  name: 'test-prompt',
  content: 'You are a helpful assistant.',
  description: 'A test prompt'
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AntigravityAdapter.install', () => {
  it('creates artifacts directory recursively', async () => {
    await adapter.install(mockPrompt)

    expect(fs.promises.mkdir).toHaveBeenCalledWith(
      '/fake/home/.gemini/antigravity/knowledge/test-prompt/artifacts',
      { recursive: true }
    )
  })

  it('writes prompt content file with signature', async () => {
    await adapter.install(mockPrompt)

    // Find the call that writes the prompt content (not metadata)
    const calls = vi.mocked(fs.promises.writeFile).mock.calls
    const promptCall = calls.find((c) => (c[0] as string).endsWith('test-prompt.md'))

    expect(promptCall).toBeDefined()
    const writtenContent = promptCall![1] as string
    expect(writtenContent).toContain('You are a helpful assistant.')
    expect(writtenContent).toContain(PROMPT_IT_SIGNATURE)
  })

  it('writes to correct prompt file path', async () => {
    await adapter.install(mockPrompt)

    const calls = vi.mocked(fs.promises.writeFile).mock.calls
    const promptCall = calls.find((c) => (c[0] as string).endsWith('test-prompt.md'))

    expect(promptCall![0]).toBe(
      '/fake/home/.gemini/antigravity/knowledge/test-prompt/artifacts/test-prompt.md'
    )
  })

  it('writes metadata.json with title and summary', async () => {
    await adapter.install(mockPrompt)

    const calls = vi.mocked(fs.promises.writeFile).mock.calls
    const metadataCall = calls.find((c) => (c[0] as string).endsWith('metadata.json'))

    expect(metadataCall).toBeDefined()
    const writtenMetadata = JSON.parse(metadataCall![1] as string)
    expect(writtenMetadata.title).toBe('test-prompt')
    expect(writtenMetadata.summary).toBe('A test prompt')
  })

  it('uses prompt name as fallback summary when no description', async () => {
    const promptWithoutDesc: Prompt = { name: 'no-desc', content: 'content' }
    await adapter.install(promptWithoutDesc)

    const calls = vi.mocked(fs.promises.writeFile).mock.calls
    const metadataCall = calls.find((c) => (c[0] as string).endsWith('metadata.json'))

    const writtenMetadata = JSON.parse(metadataCall![1] as string)
    expect(writtenMetadata.summary).toBe('no-desc')
  })
})

describe('AntigravityAdapter.uninstall', () => {
  it('removes knowledge directory with force and recursive flags', async () => {
    await adapter.uninstall('test-prompt')

    expect(fs.promises.rm).toHaveBeenCalledWith(
      '/fake/home/.gemini/antigravity/knowledge/test-prompt',
      { recursive: true, force: true }
    )
  })

  it('does not throw when directory does not exist', async () => {
    vi.mocked(fs.promises.rm).mockResolvedValue(undefined)

    await expect(adapter.uninstall('nonexistent')).resolves.not.toThrow()
  })
})

describe('AntigravityAdapter.isInstalled', () => {
  it('returns true when prompt file exists and has signature', async () => {
    vi.mocked(fs.promises.readFile).mockResolvedValue(`Some content\n${PROMPT_IT_SIGNATURE}\n`)

    const result = await adapter.isInstalled('test-prompt')
    expect(result).toBe(true)
  })

  it('returns false when prompt file exists without signature', async () => {
    vi.mocked(fs.promises.readFile).mockResolvedValue('Some content without signature')

    const result = await adapter.isInstalled('test-prompt')
    expect(result).toBe(false)
  })

  it('returns false when prompt file does not exist', async () => {
    vi.mocked(fs.promises.readFile).mockRejectedValue(new Error('ENOENT'))

    const result = await adapter.isInstalled('test-prompt')
    expect(result).toBe(false)
  })
})

describe('AntigravityAdapter.listInstalled', () => {
  it('returns names of directories with signed prompt files', async () => {
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

  it('returns empty array when knowledge directory is empty', async () => {
    vi.mocked(fs.promises.readdir).mockResolvedValue([])

    const result = await adapter.listInstalled()
    expect(result).toEqual([])
  })

  it('returns empty array when knowledge directory does not exist', async () => {
    vi.mocked(fs.promises.readdir).mockRejectedValue(new Error('ENOENT'))

    const result = await adapter.listInstalled()
    expect(result).toEqual([])
  })
})
