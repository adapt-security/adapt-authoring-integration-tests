import fs from 'fs/promises'
import path from 'path'

const DEFAULT_FIXTURES_DIR = path.resolve('fixtures')

let manifest
let resolvedDirs

/**
 * Returns the resolved fixtures directory path.
 * Override with FIXTURES_DIR env var to use custom fixtures (e.g. client-specific content).
 * @returns {string}
 */
export function getFixturesDir () {
  return process.env.FIXTURES_DIR || DEFAULT_FIXTURES_DIR
}

/**
 * Returns the custom fixtures directory path (if set via CUSTOM_FIXTURES_DIR or CUSTOM_DIR).
 * @returns {string|undefined}
 */
export function getCustomFixturesDir () {
  return process.env.CUSTOM_FIXTURES_DIR || (process.env.CUSTOM_DIR && path.join(process.env.CUSTOM_DIR, 'fixtures'))
}

/**
 * Reads a manifest.json, returning an empty object if not found.
 * @param {string} dir - Directory containing the manifest
 * @returns {Promise<Object>}
 */
async function readManifest (dir) {
  try {
    return JSON.parse(await fs.readFile(path.join(dir, 'manifest.json'), 'utf8'))
  } catch (e) {
    if (e.code === 'ENOENT') return null
    throw e
  }
}

/**
 * Loads and caches the merged manifest from the fixtures directory and optional custom directory.
 * Custom fixtures override standard fixtures when keys collide.
 * @returns {Promise<Object>} Object with { key: { file, dir } } entries
 */
export async function getManifest () {
  if (manifest) return manifest

  const fixturesDir = getFixturesDir()
  const customDir = getCustomFixturesDir()

  const standard = await readManifest(fixturesDir)
  const custom = customDir ? await readManifest(customDir) : null

  if (!standard && !custom) {
    const msg = [
      `No fixtures manifest found at ${path.join(fixturesDir, 'manifest.json')}`,
      '',
      'To set up fixtures:',
      '  1. Create a manifest.json in your fixtures directory',
      '  2. Map fixture names to files, e.g.: { "course-export": "course-export.zip" }',
      '  3. Place the fixture files alongside the manifest',
      '',
      'To use a custom fixtures directory:',
      '  FIXTURES_DIR=/path/to/fixtures node --test ...',
      '',
      'Or pass a custom directory with both fixtures/ and tests/:',
      '  CUSTOM_DIR=/path/to/custom node /path/to/integration-tests/bin/run.js',
      '',
      'See fixtures/manifest.example.json for the expected format.'
    ].join('\n')
    throw new Error(msg)
  }

  // Build merged manifest: { key: { file, dir } }
  manifest = {}
  resolvedDirs = {}

  if (standard) {
    for (const [key, file] of Object.entries(standard)) {
      manifest[key] = file
      resolvedDirs[key] = fixturesDir
    }
  }
  if (custom) {
    for (const [key, file] of Object.entries(custom)) {
      manifest[key] = file
      resolvedDirs[key] = customDir
    }
  }

  return manifest
}

/**
 * Resolves a fixture key to an absolute file path.
 * @param {string} key - Logical fixture name from manifest (e.g. "course-export")
 * @returns {Promise<string>} Absolute path to the fixture file
 * @throws {Error} If the key is not found in the manifest or the file doesn't exist
 */
export async function getFixture (key) {
  const m = await getManifest()
  if (!m[key]) {
    throw new Error(`Fixture "${key}" not found in manifest. Available: ${Object.keys(m).join(', ')}`)
  }
  const fixturePath = path.join(resolvedDirs[key], m[key])
  try {
    await fs.access(fixturePath)
  } catch {
    throw new Error(`Fixture file not found: ${fixturePath}`)
  }
  return fixturePath
}

/**
 * Resets the cached manifest (useful if switching fixtures mid-test).
 */
export function resetManifest () {
  manifest = undefined
  resolvedDirs = undefined
}
