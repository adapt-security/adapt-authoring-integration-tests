import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import { getApp } from '../lib/app.js'

let app

describe('App', () => {
  before(async () => {
    app = await getApp()
  })

  describe('.instance', () => {
    it('should return an App instance', () => {
      assert.ok(app)
      assert.equal(app.name, 'adapt-authoring-core')
    })

    it('should be a singleton', async () => {
      const app2 = await getApp()
      assert.equal(app, app2)
    })
  })

  describe('constructor', () => {
    it('should set rootDir', () => {
      assert.equal(typeof app.rootDir, 'string')
      assert.ok(app.rootDir.length > 0)
    })

    it('should initialize git info', () => {
      assert.equal(typeof app.git, 'object')
    })

    it('should have a DependencyLoader', () => {
      assert.ok(app.dependencyloader)
    })
  })

  describe('#dependencies', () => {
    it('should return the dependency configs', () => {
      assert.equal(typeof app.dependencies, 'object')
      assert.equal(app.dependencies, app.dependencyloader.configs)
    })

    it('should include core in dependencies', () => {
      assert.ok(app.dependencies['adapt-authoring-core'])
    })
  })

  describe('#getGitInfo()', () => {
    it('should return an object with branch and commit', () => {
      const info = app.getGitInfo()
      assert.equal(typeof info, 'object')
    })
  })

  describe('#waitForModule()', () => {
    it('should return a loaded module', async () => {
      const server = await app.waitForModule('server')
      assert.ok(server)
      assert.equal(server.name, 'adapt-authoring-server')
    })

    it('should return array when multiple module names are passed', async () => {
      const result = await app.waitForModule('server', 'mongodb')
      assert.ok(Array.isArray(result))
      assert.equal(result.length, 2)
    })

    it('should return single result (not array) for single module', async () => {
      const result = await app.waitForModule('server')
      assert.ok(!Array.isArray(result))
    })
  })
})
