import { describe, expect, it } from 'vitest'
import { fitLog, issueBody, pickLogLines } from './bugReport'

describe('bug report', () => {
  it('keeps error lines and the latest, with home paths shortened', () => {
    const lines = ['ok 1', 'voice: whisper exited 1', 'ok 2', 'ok 3', 'launch /home/deck/x failed', 'ok 4', 'ok 5']
    expect(pickLogLines(lines, 2, '/home/deck')).toEqual(['voice: whisper exited 1', 'launch ~/x failed', 'ok 4', 'ok 5'])
  })

  it('takes out button labels and what voice search heard', () => {
    const lines = [
      '12:00:00.000 select Holiday photos',
      '12:00:01.000 select key',
      '12:00:02.000 favorite Crash Bandicoot',
      '12:00:03.000 voice: heard "play Halo 2" in 812 ms',
      '12:00:04.000 voice: whisper exited 1: /home/deck/x'
    ]
    expect(pickLogLines(lines, 5, '/home/deck')).toEqual([
      '12:00:00.000 select (a button)',
      '12:00:01.000 select key',
      '12:00:02.000 favorite (a button)',
      '12:00:03.000 voice: heard 3 words in 812 ms',
      '12:00:04.000 voice: whisper exited 1: ~/x'
    ])
  })

  it("takes out what the Claude app asked to do, share names and the box's address", () => {
    const lines = [
      '12:00:00.000 claude: asks to use Bash: Delete old backups (rm -rf /home/deck/Backups/taxes-2025)',
      '12:00:01.000 claude: asks to use Edit: (/home/deck/notes/diary.md)',
      '12:00:02.000 claude: allowed toolu_01',
      '12:00:03.000 claude login: phone page on 192.168.1.41',
      '12:00:04.000 shares: mounted largebox-Music',
      '12:00:05.000 shares: removed largebox-Music',
      '12:00:06.000 shares: largebox-Music: mount failed: //largebox/Music: permission denied',
      '12:00:07.000 shares: fetching rclone v1.68.2',
      '12:00:08.000 shares: rclone ready'
    ]
    expect(pickLogLines(lines, 9, '/home/deck')).toEqual([
      '12:00:00.000 claude: asks to use Bash',
      '12:00:01.000 claude: asks to use Edit',
      '12:00:02.000 claude: allowed toolu_01',
      '12:00:03.000 claude login: phone page on (the box)',
      '12:00:04.000 shares: mounted (a share)',
      '12:00:05.000 shares: removed (a share)',
      '12:00:06.000 shares: (a share): mount failed: (a share): permission denied',
      '12:00:07.000 shares: fetching rclone v1.68.2',
      '12:00:08.000 shares: rclone ready'
    ])
  })

  it("doesn't keep a label as an error line", () => {
    expect(pickLogLines(['select Crash Bandicoot', 'ok'], 1, '/home/deck')).toEqual(['ok'])
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
