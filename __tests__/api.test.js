import { describe, expect, it } from 'vitest'
import { resolveImageUrl } from '../src/services/api'

describe('resolveImageUrl', () => {
  it('returns empty string for empty value', () => {
    expect(resolveImageUrl('')).toBe('')
  })

  it('returns absolute URL as-is', () => {
    const url = 'https://example.com/pic.jpg'
    expect(resolveImageUrl(url)).toBe(url)
  })
})
