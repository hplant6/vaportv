// The Claude app's speaking voices: Piper voices (huggingface.co/rhasspy/piper-voices), each
// downloaded the first time it's picked (~63 MB). Lessac was the first and stays the default;
// its dataset is non-commercial (NOTICE.md). The others are public domain or CC.

export interface ClaudeVoice {
  /** Piper's name for it, which is also its file name. */
  id: string
  /** As the button shows it. */
  name: string
  /** Its folder in piper-voices: language/dialect/speaker/quality. */
  path: string
}

export const CLAUDE_VOICES: ClaudeVoice[] = [
  { id: 'en_US-lessac-medium', name: 'Lessac', path: 'en/en_US/lessac/medium' },
  { id: 'en_US-kristin-medium', name: 'Kristin', path: 'en/en_US/kristin/medium' },
  { id: 'en_US-ljspeech-medium', name: 'Linda', path: 'en/en_US/ljspeech/medium' },
  { id: 'en_US-joe-medium', name: 'Joe', path: 'en/en_US/joe/medium' },
  { id: 'en_US-norman-medium', name: 'Norman', path: 'en/en_US/norman/medium' },
  { id: 'en_GB-cori-medium', name: 'Cori (UK)', path: 'en/en_GB/cori/medium' },
  { id: 'en_GB-northern_english_male-medium', name: 'Northern (UK)', path: 'en/en_GB/northern_english_male/medium' }
]

export const DEFAULT_CLAUDE_VOICE = CLAUDE_VOICES[0].id

export function claudeVoice(id: string | undefined): ClaudeVoice {
  return CLAUDE_VOICES.find((v) => v.id === id) ?? CLAUDE_VOICES[0]
}
