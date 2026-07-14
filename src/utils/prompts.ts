import { text, confirm, select, isCancel, cancel } from '@clack/prompts'

function handleCancel(result: any): asserts result is Exclude<typeof result, symbol> {
  if (isCancel(result)) {
    cancel('Operation cancelled.')
    process.exit(0)
  }
}

export async function promptText(options: Parameters<typeof text>[0]) {
  const result = await text(options)
  handleCancel(result)
  return result
}

export async function promptConfirm(options: Parameters<typeof confirm>[0]) {
  const result = await confirm(options)
  handleCancel(result)
  return result
}

export async function promptSelect<T>(options: any) {
  const result = await select<T>(options)
  handleCancel(result)
  return result as T
}
