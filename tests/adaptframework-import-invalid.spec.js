import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { getApp, getModule, cleanDb } from '../lib/app.js'
import { getFixture } from '../lib/fixtures.js'

let framework
let tmpRoot

const defaultImportOptions = {
  userId: '000000000000000000000000',
  tags: [],
  importContent: true,
  importPlugins: true,
  migrateContent: true,
  updatePlugins: false,
  removeSource: false
}

/**
 * Creates a temporary directory with the given file structure.
 * @param {Object} files - Map of relative paths to file contents (string or Buffer)
 * @returns {Promise<string>} Absolute path to the temp directory
 */
async function createTempImport (files) {
  const dir = await fs.mkdtemp(path.join(tmpRoot, 'import-'))
  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = path.join(dir, filePath)
    await fs.mkdir(path.dirname(fullPath), { recursive: true })
    await fs.writeFile(fullPath, typeof content === 'string' ? content : content)
  }
  return dir
}

/**
 * Creates a valid base import structure that can be selectively broken.
 * @param {Object} overrides - Files to override or add
 * @param {string[]} remove - File paths to exclude from the base structure
 * @returns {Promise<string>}
 */
async function createImportFrom (overrides = {}, remove = []) {
  const base = {
    'package.json': JSON.stringify({ name: 'adapt_framework', version: '5.32.2' }),
    'src/course/config.json': JSON.stringify({ _defaultLanguage: 'en', _enabledPlugins: [] }),
    'src/course/en/course.json': JSON.stringify({ _type: 'course', title: 'Test Course', _latestTrackingId: 0 }),
    'src/course/en/contentObjects.json': '[]',
    'src/course/en/articles.json': '[]',
    'src/course/en/blocks.json': '[]',
    'src/course/en/components.json': '[]'
  }
  for (const key of remove) {
    delete base[key]
  }
  return createTempImport({ ...base, ...overrides })
}

describe('AdaptFramework invalid import', () => {
  before(async () => {
    await getApp()
    framework = await getModule('adaptframework')
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aat-invalid-import-'))
  })

  after(async () => {
    await cleanDb()
    await fs.rm(tmpRoot, { recursive: true, force: true })
  })

  describe('missing course directory', () => {
    it('should reject an import with no course directory', async () => {
      const importPath = await createTempImport({
        'package.json': JSON.stringify({ name: 'adapt_framework', version: '5.32.2' }),
        'src/readme.txt': 'no course here'
      })
      await assert.rejects(
        () => framework.importCourse({ ...defaultImportOptions, importPath }),
        (err) => {
          assert.ok(
            err.code === 'FW_IMPORT_INVALID_COURSE' || err.message?.includes('IMPORT_INVALID'),
            `expected FW_IMPORT_INVALID_COURSE, got: ${err.code || err.message}`
          )
          return true
        }
      )
    })
  })

  describe('missing config.json', () => {
    it('should reject an import with no config.json in the course directory', async () => {
      const importPath = await createImportFrom({}, ['src/course/config.json'])
      await assert.rejects(
        () => framework.importCourse({ ...defaultImportOptions, importPath }),
        (err) => {
          assert.ok(
            err.code === 'FW_IMPORT_INVALID_COURSE' || err.message?.includes('IMPORT_INVALID'),
            `expected FW_IMPORT_INVALID_COURSE, got: ${err.code || err.message}`
          )
          return true
        }
      )
    })
  })

  describe('missing language directory', () => {
    it('should reject when the language directory does not exist', async () => {
      const importPath = await createImportFrom(
        { 'src/course/config.json': JSON.stringify({ _defaultLanguage: 'xx', _enabledPlugins: [] }) },
        ['src/course/en/course.json', 'src/course/en/contentObjects.json', 'src/course/en/articles.json', 'src/course/en/blocks.json', 'src/course/en/components.json']
      )
      await assert.rejects(
        () => framework.importCourse({ ...defaultImportOptions, importPath }),
        (err) => {
          assert.ok(
            err.code === 'FW_IMPORT_INVALID_COURSE' || err.message?.includes('IMPORT_INVALID'),
            `expected FW_IMPORT_INVALID_COURSE, got: ${err.code || err.message}`
          )
          return true
        }
      )
    })
  })

  describe('missing package.json', () => {
    it('should reject when package.json is missing', async () => {
      const importPath = await createImportFrom({}, ['package.json'])
      await assert.rejects(
        () => framework.importCourse({ ...defaultImportOptions, importPath }),
        (err) => {
          assert.ok(
            err.code === 'FW_IMPORT_INVALID' || err.message?.includes('IMPORT_INVALID'),
            `expected FW_IMPORT_INVALID, got: ${err.code || err.message}`
          )
          return true
        }
      )
    })
  })

  describe('malformed JSON', () => {
    it('should reject when config.json contains invalid JSON', async () => {
      const importPath = await createImportFrom({
        'src/course/config.json': '{ this is not valid json }'
      })
      await assert.rejects(
        () => framework.importCourse({ ...defaultImportOptions, importPath }),
        (err) => {
          assert.ok(
            err.code === 'FILE_SYNTAX_ERROR' || err.code === 'FW_IMPORT_INVALID_COURSE' || err.message?.includes('SYNTAX') || err.message?.includes('INVALID'),
            `expected syntax or invalid course error, got: ${err.code || err.message}`
          )
          return true
        }
      )
    })

    it('should reject when package.json contains invalid JSON', async () => {
      const importPath = await createImportFrom({
        'package.json': '{ broken json !!!'
      })
      await assert.rejects(
        () => framework.importCourse({ ...defaultImportOptions, importPath }),
        (err) => {
          assert.ok(
            err.code === 'FW_IMPORT_INVALID' || err.code === 'FW_IMPORT_INVALID_COURSE' || err.message?.includes('IMPORT_INVALID'),
            `expected FW_IMPORT_INVALID, got: ${err.code || err.message}`
          )
          return true
        }
      )
    })
  })

  describe('incompatible framework version', () => {
    it('should reject when framework major version does not match and migrateContent is false', async () => {
      const importPath = await createImportFrom({
        'package.json': JSON.stringify({ name: 'adapt_framework', version: '1.0.0' })
      })
      await assert.rejects(
        () => framework.importCourse({ ...defaultImportOptions, importPath, migrateContent: false }),
        (err) => {
          assert.ok(
            err.code === 'FW_IMPORT_INCOMPAT' || err.message?.includes('IMPORT_INCOMPAT'),
            `expected FW_IMPORT_INCOMPAT, got: ${err.code || err.message}`
          )
          return true
        }
      )
    })
  })

  describe('missing required parameters', () => {
    it('should reject when importPath is not provided', async () => {
      await assert.rejects(
        () => framework.importCourse({ userId: '000000000000000000000000' }),
        (err) => {
          assert.ok(
            err.code === 'INVALID_PARAMS' || err.message?.includes('INVALID_PARAMS') || err.message?.includes('importPath'),
            `expected INVALID_PARAMS, got: ${err.code || err.message}`
          )
          return true
        }
      )
    })

    it('should reject when userId is not provided', async () => {
      await assert.rejects(
        () => framework.importCourse({ importPath: '/tmp/fake-path' }),
        (err) => {
          assert.ok(
            err.code === 'INVALID_PARAMS' || err.message?.includes('INVALID_PARAMS') || err.message?.includes('userId'),
            `expected INVALID_PARAMS, got: ${err.code || err.message}`
          )
          return true
        }
      )
    })
  })

  describe('non-zip file', () => {
    it('should reject when importPath points to a non-zip file with .zip extension', async () => {
      const fakePath = path.join(tmpRoot, 'not-a-zip.zip')
      await fs.writeFile(fakePath, 'this is not a zip file')
      await assert.rejects(
        () => framework.importCourse({ ...defaultImportOptions, importPath: fakePath }),
        (err) => {
          assert.ok(err, 'should throw an error for non-zip file')
          return true
        }
      )
    })

    it('should reject when importPath points to a non-existent file', async () => {
      await assert.rejects(
        () => framework.importCourse({ ...defaultImportOptions, importPath: '/tmp/does-not-exist-12345.zip' }),
        (err) => {
          assert.ok(err, 'should throw an error for missing file')
          return true
        }
      )
    })
  })

  describe('no database side-effects on failed import', () => {
    it('should not leave content in the database after a failed import', async () => {
      const coursesBefore = await (await getModule('content')).find({ _type: 'course' })
      const importPath = await createTempImport({
        'package.json': JSON.stringify({ name: 'adapt_framework', version: '5.32.2' }),
        'src/readme.txt': 'no course here'
      })
      try {
        await framework.importCourse({ ...defaultImportOptions, importPath })
      } catch {
        // expected
      }
      const coursesAfter = await (await getModule('content')).find({ _type: 'course' })
      assert.equal(coursesAfter.length, coursesBefore.length, 'failed import should not leave orphan courses')
    })
  })
})
