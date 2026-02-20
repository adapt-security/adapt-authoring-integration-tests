import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'

const FIXTURES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures')

let manifest
let resolvedDirs
let tempDir

/**
 * Returns the custom fixtures directory path (if CUSTOM_DIR is set).
 * @returns {string|undefined}
 */
function getCustomFixturesDir () {
  return process.env.CUSTOM_DIR && path.join(process.env.CUSTOM_DIR, 'fixtures')
}

/**
 * Reads a manifest.json, returning null if not found.
 * @param {string} dir - Directory containing the manifest
 * @returns {Promise<Object|null>}
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
 * Loads and caches the merged manifest from the built-in fixtures directory
 * and optional custom directory (CUSTOM_DIR/fixtures/).
 * Custom fixtures override built-in fixtures when keys collide.
 * @returns {Promise<Object>}
 */
export async function getManifest () {
  if (manifest) return manifest

  const customDir = getCustomFixturesDir()

  const standard = await readManifest(FIXTURES_DIR)
  const custom = customDir ? await readManifest(customDir) : null

  if (!standard && !custom) {
    const msg = [
      `No fixtures manifest found at ${path.join(FIXTURES_DIR, 'manifest.json')}`,
      '',
      'To set up fixtures:',
      '  1. Create a manifest.json in the fixtures directory',
      '  2. Map fixture names to files, e.g.: { "course-export": "course-export.zip" }',
      '  3. Place the fixture files alongside the manifest',
      '',
      'To provide custom fixtures:',
      '  CUSTOM_DIR=/path/to/custom npx at-integration-test',
      '  (expects custom/fixtures/manifest.json)'
    ].join('\n')
    throw new Error(msg)
  }

  manifest = {}
  resolvedDirs = {}

  if (standard) {
    for (const [key, file] of Object.entries(standard)) {
      manifest[key] = file
      resolvedDirs[key] = FIXTURES_DIR
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
 * Returns a temp directory for fixture copies, creating it on first call.
 * @returns {Promise<string>}
 */
async function getTempDir () {
  if (!tempDir) {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aat-fixtures-'))
  }
  return tempDir
}

/**
 * Resolves a fixture key to an absolute file path.
 * Copies the fixture to a temp directory so the original is preserved
 * (the import process may consume/delete the source file).
 * @param {string} key - Logical fixture name from manifest (e.g. "course-export")
 * @returns {Promise<string>} Absolute path to the copied fixture file
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
  const tmp = await getTempDir()
  const destPath = path.join(tmp, `${key}-${Date.now()}-${m[key]}`)
  await fs.copyFile(fixturePath, destPath)
  return destPath
}

/**
 * Resets the cached manifest (useful if switching fixtures mid-test).
 */
export function resetManifest () {
  manifest = undefined
  resolvedDirs = undefined
}

/**
 * Removes the temp directory used for fixture copies.
 * Call in a global teardown or after() hook if desired.
 */
export async function cleanupFixtures () {
  if (tempDir) {
    await fs.rm(tempDir, { recursive: true, force: true })
    tempDir = undefined
  }
}
