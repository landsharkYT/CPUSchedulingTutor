import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import App from './App'

afterEach(() => vi.unstubAllGlobals())

describe('initial exercise', () => {
  it('renders the paper-exam workflow and the key controls', () => {
    const storage = { getItem: () => null, setItem: () => undefined }
    vi.stubGlobal('localStorage', storage)
    const html = renderToString(<App />)
    expect(html).toContain('Process set')
    expect(html).toContain('Build the timeline')
    expect(html).toContain('Calculate the times')
    expect(html).toContain('Check my work')
    expect(html).toContain('Open settings')
    expect(html).toContain('Move finish')
    expect(html).not.toContain('Worked solution')
  })
})
