import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { DEFAULT_CLEAN_COLLECTIONS } from '../lib/app.js'
import { dropTestDb } from '../lib/db.js'

// ---------------------------------------------------------------------------
// DEFAULT_CLEAN_COLLECTIONS
// ---------------------------------------------------------------------------
describe('DEFAULT_CLEAN_COLLECTIONS', () => {
  it('should include contentplugins to prevent stale plugin records', () => {
    assert.ok(
      DEFAULT_CLEAN_COLLECTIONS.includes('contentplugins'),
      'contentplugins must be in the default clean list — stale records ' +
      'cause MISSING_SCHEMA errors on subsequent test runs'
    )
  })

  it('should include the core content collections', () => {
    for (const name of ['content', 'assets', 'courseassets', 'tags', 'adaptbuilds']) {
      assert.ok(
        DEFAULT_CLEAN_COLLECTIONS.includes(name),
        `expected "${name}" in DEFAULT_CLEAN_COLLECTIONS`
      )
    }
  })
})

// ---------------------------------------------------------------------------
// dropTestDb
// ---------------------------------------------------------------------------
describe('dropTestDb()', () => {
  it('should return false when config directory does not exist', async () => {
    // Point at a non-existent directory so config import fails
    const result = await dropTestDb('/tmp/nonexistent-aat-dir')
    assert.equal(result, false)
  })

  it('should be a function that accepts a cwd argument', () => {
    assert.equal(typeof dropTestDb, 'function')
    assert.equal(dropTestDb.length, 0) // default param, so length is 0
  })
})
