import { describe, it, expect, vi, beforeEach } from 'vitest'
import { outro } from '@clack/prompts'
import logger from '../src/utils/logger.js'

vi.mock('@clack/prompts', () => ({
  outro: vi.fn()
}))

const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

beforeEach(() => {
  consoleSpy.mockClear()
  vi.mocked(outro).mockClear()
})

describe('logger.error', () => {
  it('prepends "Error:" when message does not start with it', () => {
    logger.error('something failed')

    expect(consoleSpy).toHaveBeenCalledOnce()
    const output = consoleSpy.mock.calls[0][0] as string
    expect(output).toContain('Error: something failed')
  })

  it('does not duplicate "Error:" prefix', () => {
    logger.error('Error: already prefixed')

    const output = consoleSpy.mock.calls[0][0] as string
    expect(output).toContain('Error: already prefixed')
    expect(output).not.toContain('Error: Error:')
  })

  it('calls console.log, not console.error', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    logger.error('test')

    expect(consoleSpy).toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})

describe('logger.validation', () => {
  it('logs message without "Error:" prefix', () => {
    logger.validation('field is required')

    expect(consoleSpy).toHaveBeenCalledOnce()
    const output = consoleSpy.mock.calls[0][0] as string
    expect(output).toContain('field is required')
    expect(output).not.toContain('Error:')
  })
})

describe('logger.success', () => {
  it('calls clack outro when endFlow is true (default)', () => {
    logger.success('done!')

    expect(outro).toHaveBeenCalledOnce()
    const outroArg = vi.mocked(outro).mock.calls[0][0] as string
    expect(outroArg).toContain('done!')
    expect(consoleSpy).not.toHaveBeenCalled()
  })

  it('calls console.log when endFlow is false', () => {
    logger.success('done!', false)

    expect(consoleSpy).toHaveBeenCalledOnce()
    const output = consoleSpy.mock.calls[0][0] as string
    expect(output).toContain('done!')
    expect(outro).not.toHaveBeenCalled()
  })
})

describe('logger.warn', () => {
  it('logs warning message', () => {
    logger.warn('be careful')

    expect(consoleSpy).toHaveBeenCalledOnce()
    const output = consoleSpy.mock.calls[0][0] as string
    expect(output).toContain('be careful')
  })

  it('logs hint in gray when provided', () => {
    logger.warn('warning', 'some hint')

    expect(consoleSpy).toHaveBeenCalledTimes(2)
    const hintOutput = consoleSpy.mock.calls[1][0] as string
    expect(hintOutput).toContain('some hint')
  })

  it('does not log hint when not provided', () => {
    logger.warn('warning only')

    expect(consoleSpy).toHaveBeenCalledOnce()
  })
})

describe('logger.info', () => {
  it('logs message as plain text', () => {
    logger.info('some info')

    expect(consoleSpy).toHaveBeenCalledWith('some info')
  })
})

describe('logger.header', () => {
  it('prints empty line, title, and underline with correct length', () => {
    logger.header('My Title')

    expect(consoleSpy).toHaveBeenCalledTimes(3)

    // First call: empty line
    expect(consoleSpy.mock.calls[0][0]).toBe('')

    // Second call: title
    const titleOutput = consoleSpy.mock.calls[1][0] as string
    expect(titleOutput).toContain('My Title')

    // Third call: underline with correct length
    const underlineOutput = consoleSpy.mock.calls[2][0] as string
    expect(underlineOutput).toContain('-'.repeat('My Title'.length))
  })
})

describe('logger.property', () => {
  it('prints key and value', () => {
    logger.property('Name:', 'prompt-it')

    expect(consoleSpy).toHaveBeenCalledOnce()
    const output = consoleSpy.mock.calls[0][0] as string
    expect(output).toContain('Name:')
    expect(output).toContain('prompt-it')
  })
})

describe('logger.blank', () => {
  it('prints empty line', () => {
    logger.blank()

    expect(consoleSpy).toHaveBeenCalledWith('')
  })
})
