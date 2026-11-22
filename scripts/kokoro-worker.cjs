// The Claude app's voice: Kokoro (through sherpa-onnx), run apart from vaporTV (Electron as plain
// Node) so a crash in the engine can't take vaporTV with it, and its work doesn't hold up
// vaporTV's main process. Loads the model once, then reads a sentence a line on stdin, writes
// each as a WAV in the output folder and prints its path, in order. Shipped beside the app by
// scripts/kokoro.sh; started by src/main/speech.ts.
//
//   worker.cjs <model dir> <output dir> <speaker id> [speed] [threads] [Japanese speaker id]

const { join } = require('node:path')
const { createInterface } = require('node:readline')
const sherpa = require('sherpa-onnx-node')

const [modelDir, outDir, sid, speed = '1', threads = '4', jaSid = '37'] = process.argv.slice(2)

/** One engine per language: Kokoro's eSpeak fallback is set to a single one when it's made. */
function engine(lang) {
  return new sherpa.OfflineTts({
    model: {
      kokoro: {
        model: join(modelDir, 'model.onnx'),
        voices: join(modelDir, 'voices.bin'),
        tokens: join(modelDir, 'tokens.txt'),
        // British spellings and sounds from the lexicon; words it doesn't have, spelled out by eSpeak.
        lexicon: join(modelDir, 'lexicon-gb-en.txt'),
        dataDir: join(modelDir, 'espeak-ng-data'),
        lang
      },
      numThreads: Number(threads),
      provider: 'cpu'
    },
    maxNumSentences: 1
  })
}

const english = engine('en')
// Japanese (kana, which eSpeak reads; it skips most kanji) gets its own engine and voice, made the first time it's needed.
let japanese = null
const JAPANESE = /[\u3040-\u30ff\u3400-\u9fff]/

let n = 0
createInterface({ input: process.stdin }).on('line', (line) => {
  const text = line.trim()
  if (!text) return
  try {
    // A copied buffer: Electron's memory sandbox refuses the external one sherpa-onnx hands back by default.
    const ja = JAPANESE.test(text)
    if (ja) japanese ??= engine('ja')
    const audio = (ja ? japanese : english).generate({ text, sid: Number(ja ? jaSid : sid), speed: Number(speed), enableExternalBuffer: false })
    const file = join(outDir, `${String(++n).padStart(5, '0')}.wav`)
    sherpa.writeWave(file, { samples: audio.samples, sampleRate: audio.sampleRate })
    process.stdout.write(`${file}\n`)
  } catch (err) {
    // Said nothing for this one: an empty line keeps vaporTV's count of what's on its way right.
    process.stderr.write(`kokoro: ${err}\n`)
    process.stdout.write('\n')
  }
})
