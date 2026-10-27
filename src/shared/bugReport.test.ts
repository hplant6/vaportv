import { describe, expect, it } from 'vitest'
import { fitLog, issueBody, pickLogLines } from './bugReport'

describe('bug report', () => {
  it('keeps error lines and the latest, with home paths shortened', () => {
    const lines = ['ok 1', 'voice: whisper exited 1', 'ok 2', 'ok 3', 'launch /home/deck/x failed', 'ok 4', 'ok 5']
    expect(pickLogLines(lines, 2, '/home/deck')).toEqual(['voice: whisper exited 1', 'launch ~/x failed', 'ok 4', 'ok 5'])
  })

  it('fits the link under the QR limit by dropping the oldest log lines', () => {
    const lines = Array.from({ length: 60 }, (_, i) => `12:00:${String(i).padStart(2, '0')} gamepad press: [0 "Xbox Wireless Controller" standard] line ${i}`)
    const { url, logLines } = fitLog(['vaporTV 0.9.0'], lines)
    expect(url.length).toBeLessThanOrEqual(2000)
    expect(logLines).toBeGreaterThan(0)
    expect(logLines).toBeLessThan(60)
    expect(url).not.toContain('title=')
    expect(decodeURIComponent(url.replace(/\+/g, ' '))).toContain('line 59')
  })

  it('leaves room to describe it, then the system and log', () => {
    const body = issueBody(['vaporTV 0.9.0'], ['log line'])
    expect(body).toContain('### What happened\n\n<!--')
    expect(body).toContain('- vaporTV 0.9.0')
    expect(body).toContain('```\nlog line\n```')
  })
})
