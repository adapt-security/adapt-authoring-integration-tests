import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { pathToFileURL } from 'url'
import { getApp, getModule } from '../lib/app.js'
import { runMigrations } from 'adapt-authoring-migrations'

let mongodb
let tmpDir
let connectionUri

/**
 * Creates a temporary directory with a config file and a config migration.
 * The config migration moves `test-module.oldKey` to `test-module.newKey`.
 *
 * @param {Object} [opts]
 * @param {boolean} [opts.readOnlyConfig] - Set readOnlyConfig in the config file
 * @returns {Promise<{ rootDir: string, configFilePath: string, depDir: string }>}
 */
async function createScaffold (opts = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mig-test-'))
  const confDir = path.join(dir, 'conf')
  const depDir = path.join(dir, 'dep')
  const migDir = path.join(depDir, 'migrations')
  await fs.mkdir(confDir, { recursive: true })
  await fs.mkdir(migDir, { recursive: true })

  const config = {
    'adapt-authoring-mongodb': { connectionUri },
    'test-module': { oldKey: 'value' }
  }
  if (opts.readOnlyConfig) {
    config['adapt-authoring-migrations'] = { readOnlyConfig: true }
  }
  const configFilePath = path.join(confDir, 'testing.config.js')
  await fs.writeFile(configFilePath, `export default ${JSON.stringify(config, null, 2)}\n`, 'utf8')

  const migrationCode = `export default function (m) {
  m.describe('move oldKey to newKey')
  m.where('test-module').mutate(config => {
    if (config['test-module']?.oldKey) {
      config['test-module'].newKey = config['test-module'].oldKey
      delete config['test-module'].oldKey
    }
  })
}
`
  await fs.writeFile(path.join(migDir, '1.0.0-conf.js'), migrationCode, 'utf8')

  return { rootDir: dir, configFilePath, depDir }
}

/**
 * Collects log calls into an array for assertion.
 */
function createLogCollector () {
  const logs = []
  const log = (level, id, msg) => logs.push({ level, id, msg })
  return { logs, log }
}

describe('Config migration readOnlyConfig', () => {
  before(async () => {
    await getApp()
    mongodb = await getModule('mongodb')
    connectionUri = mongodb.getConfig('connectionUri')
  })

  after(async () => {
    if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true })
  })

  // ── readOnlyConfig: true ───────────────────────────────────────────

  describe('readOnlyConfig: true', () => {
    let scaffold
    let logs

    before(async () => {
      scaffold = await createScaffold({ readOnlyConfig: true })
      tmpDir = scaffold.rootDir
      const collector = createLogCollector()
      logs = collector.logs
      await runMigrations({
        dependencies: { 'test-dep': { rootDir: scaffold.depDir } },
        configFilePath: scaffold.configFilePath,
        rootDir: scaffold.rootDir,
        log: collector.log
      })
    })

    it('should not modify the config file', async () => {
      const config = (await import(pathToFileURL(scaffold.configFilePath).href + `?t=${Date.now()}`)).default
      assert.equal(config['test-module'].oldKey, 'value', 'oldKey should still be present')
      assert.equal(config['test-module'].newKey, undefined, 'newKey should not exist')
    })

    it('should not record the migration as completed', async () => {
      const db = mongodb.getCollection('migrations')
      const record = await db.findOne({ module: 'test-dep', version: '1.0.0', type: 'conf' })
      assert.equal(record, null, 'migration should not be in the completed collection')
    })

    it('should log a READ-ONLY CONFIG warning', () => {
      const warning = logs.find(l => l.msg?.includes('[READ-ONLY CONFIG]'))
      assert.ok(warning, 'should have logged a [READ-ONLY CONFIG] message')
      assert.equal(warning.level, 'warn')
    })

    it('should log the key-level diff', () => {
      const diffLines = logs.filter(l => /^\s+[+\-~]/.test(l.msg))
      assert.ok(diffLines.length > 0, 'should have logged diff lines')
    })
  })

  // ── dryRun: true ───────────────────────────────────────────────────

  describe('dryRun: true', () => {
    let scaffold
    let logs

    before(async () => {
      scaffold = await createScaffold()
      tmpDir = scaffold.rootDir
      const collector = createLogCollector()
      logs = collector.logs
      await runMigrations({
        dependencies: { 'test-dep': { rootDir: scaffold.depDir } },
        configFilePath: scaffold.configFilePath,
        rootDir: scaffold.rootDir,
        log: collector.log,
        dryRun: true
      })
    })

    it('should not modify the config file', async () => {
      const config = (await import(pathToFileURL(scaffold.configFilePath).href + `?t=${Date.now()}`)).default
      assert.equal(config['test-module'].oldKey, 'value', 'oldKey should still be present')
    })

    it('should log "would write" message', () => {
      const msg = logs.find(l => l.msg?.includes('would write'))
      assert.ok(msg, 'should have logged a would-write message')
    })

    it('should log the key-level diff', () => {
      const diffLines = logs.filter(l => /^\s+[+\-~]/.test(l.msg))
      assert.ok(diffLines.length > 0, 'dry run should also log diff lines')
    })
  })

  // ── Normal mode (control) ──────────────────────────────────────────

  describe('normal mode (no flags)', () => {
    let scaffold
    let logs

    before(async () => {
      scaffold = await createScaffold()
      tmpDir = scaffold.rootDir
      const collector = createLogCollector()
      logs = collector.logs
      await runMigrations({
        dependencies: { 'test-dep': { rootDir: scaffold.depDir } },
        configFilePath: scaffold.configFilePath,
        rootDir: scaffold.rootDir,
        log: collector.log
      })
    })

    it('should update the config file', async () => {
      const config = (await import(pathToFileURL(scaffold.configFilePath).href + `?t=${Date.now()}`)).default
      assert.equal(config['test-module'].newKey, 'value', 'newKey should be present')
      assert.equal(config['test-module'].oldKey, undefined, 'oldKey should be removed')
    })

    it('should record the migration as completed', async () => {
      const db = mongodb.getCollection('migrations')
      const record = await db.findOne({ module: 'test-dep', version: '1.0.0', type: 'conf' })
      assert.ok(record, 'migration should be recorded as completed')
      assert.ok(record.completedAt, 'should have a completedAt timestamp')
    })

    it('should log "updated" message', () => {
      const msg = logs.find(l => l.msg?.includes('updated'))
      assert.ok(msg, 'should have logged an updated message')
    })
  })
})
