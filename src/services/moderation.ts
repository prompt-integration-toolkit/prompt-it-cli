export async function moderateContent(content: string): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) {
    throw new Error('NO_API_KEY')
  }

  const response = await fetch('https://api.openai.com/v1/moderations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      input: content
    })
  })

  if (!response.ok) {
    // If OpenAI API is down or returns error, we treat it as unavailable
    throw new Error('API_ERROR')
  }

  const data = await response.json()

  if (data.results && data.results.length > 0) {
    const result = data.results[0]
    if (result.flagged) {
      const flaggedCategories = Object.entries(result.categories)
        .filter(([_, isFlagged]) => isFlagged)
        .map(([category]) => category)

      throw new Error(`MODERATION_FAILED:${flaggedCategories.join(', ')}`)
    }
  }
}
