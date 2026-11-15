// The Claude app's voice: Kokoro (through sherpa-onnx), run apart from vaporTV (Electron as plain
// Node) so a crash in the engine can't take vaporTV with it, and its work doesn't hold up
// vaporTV's main process. Loads the model once, then reads a sentence a line on stdin, writes
// each as a WAV in the output folder and prints its path, in order. Shipped beside the app by
// scripts/kokoro.sh; started by src/main/speech.ts.
//
//   worker.cjs <model dir> <output dir> <speaker id> [speed] [threads]

const { join } = require('node:path')
const { createInterface } = require('node:readline')
const sherpa = require('sherpa-onnx-node')

const [modelDir, outDir, sid, speed = '1', threads = '4'] = process.argv.slice(2)

const tts = new sherpa.OfflineTts({
  model: {
    kokoro: {
      model: join(modelDir, 'model.onnx'),
      voices: join(modelDir, 'voices.bin'),
      tokens: join(modelDir, 'tokens.txt'),
      // British spellings and sounds from the lexicon; words it doesn't have, spelled out by eSpeak.
      lexicon: join(modelDir, 'lexicon-gb-en.txt'),
      dataDir: join(modelDir, 'espeak-ng-data'),
      lang: 'en'
    },
    numThreads: Number(threads),
    provider: 'cpu'
  },
  maxNumSentences: 1
})

let n = 0
createInterface({ input: process.stdin }).on('line', (line) => {
  const text = line.trim()
  if (!text) return
  try {
    // A copied buffer: Electron's memory sandbox refuses the external one sherpa-onnx hands back by default.
    const audio = tts.generate({ text, sid: Number(sid), speed: Number(speed), enableExternalBuffer: false })
    const file = join(outDir, `${String(++n).padStart(5, '0')}.wav`)
    sherpa.writeWave(file, { samples: audio.samples, sampleRate: audio.sampleRate })
    process.stdout.write(`${file}\n`)
  } catch (err) {
    // Said nothing for this one: an empty line keeps vaporTV's count of what's on its way right.
    process.stderr.write(`kokoro: ${err}\n`)
    process.stdout.write('\n')
  }
})
