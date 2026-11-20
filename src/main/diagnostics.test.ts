import { mkdtemp, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { makeDiagnostics, registerDiagnostics } from './diagnostics'

describe('diagnostics bundle', () => {
  it("has each side's snapshot and the whole log, scrubbed as a GitHub report is", async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vaportv-diag-'))
    const log = join(dir, 'input.log')
    await writeFile(log, ['steamtv started', '12:00:00.000 select Holiday photos', `12:00:01.000 claude: asks to use Bash: tidy (rm ${homedir()}/x)`, '12:00:02.000 page error: boom'].join('\n'))
    registerDiagnostics('test', () => ({ path: `${homedir()}/Music`, n: 2 }))
    registerDiagnostics('broken', () => {
      throw new Error('nope')
    })
    const text = await makeDiagnostics(['vaporTV 1.0'], { 'music.music': { sounding: false, held: true } }, log)
    expect(text).toContain('- vaporTV 1.0')
    expect(text).toContain('"path": "~/Music"')
    expect(text).toContain('"error": "Error: nope"')
    expect(text).toContain('"held": true')
    expect(text).toContain('12:00:00.000 select (a button)')
    expect(text).toContain('12:00:01.000 claude: asks to use Bash')
    expect(text).not.toContain('Holiday photos')
    expect(text).not.toContain('rm ')
    expect(text).toContain('12:00:02.000 page error: boom')
  })
})
