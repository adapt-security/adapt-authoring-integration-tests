import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs/promises'
import { getApp, getModule, cleanDb } from '../lib/app.js'
import { getFixture } from '../lib/fixtures.js'

let framework
let content
let courseId

describe('AdaptFramework build', () => {
  before(async () => {
    await getApp()
    framework = await getModule('adaptframework')
    content = await getModule('content')

    // Import a course to use as build input
    const fixturePath = await getFixture('course-export')
    const importer = await framework.importCourse({
      importPath: fixturePath,
      userId: '000000000000000000000000',
      tags: [],
      importContent: true,
      importPlugins: true,
      migrateContent: true,
      updatePlugins: false,
      removeSource: false
    })
    courseId = importer.summary.courseId.toString()
  })

  after(async () => {
    await cleanDb()
  })

  describe('Export', () => {
    let buildResult

    it('should export a course without errors', async () => {
      buildResult = await framework.buildCourse({
        action: 'export',
        courseId,
        userId: '000000000000000000000000'
      })
      assert.ok(buildResult, 'build should return a result')
      assert.ok(buildResult.buildData, 'result should include buildData')
    })

    it('should have created a build record', async () => {
      const mongodb = await getModule('mongodb')
      const [record] = await mongodb.find('adaptbuilds', { _id: buildResult.buildData._id })
      assert.ok(record, 'build record should exist in database')
      assert.equal(record.action, 'export')
      assert.equal(record.courseId.toString(), courseId)
    })

    it('should have created an output file', async () => {
      const location = buildResult.buildData.location
      assert.ok(location, 'buildData should have a location')
      const stat = await fs.stat(location)
      assert.ok(stat.size > 0, 'output file should not be empty')
    })

    it('should have created a zip with substantial content', async () => {
      const stat = await fs.stat(buildResult.buildData.location)
      assert.ok(stat.size > 1000, 'export zip should have substantial content')
    })
  })

  describe('Preview', () => {
    let buildResult

    it('should create a preview build without errors', async () => {
      buildResult = await framework.buildCourse({
        action: 'preview',
        courseId,
        userId: '000000000000000000000000'
      })
      assert.ok(buildResult, 'build should return a result')
      assert.ok(buildResult.buildData, 'result should include buildData')
      assert.equal(buildResult.isPreview, true, 'should be marked as preview')
    })

    it('should have created the build output directory', async () => {
      const location = buildResult.buildData.location
      assert.ok(location, 'buildData should have a location')
      const stat = await fs.stat(location)
      assert.ok(stat.isDirectory(), 'preview output should be a directory')
    })

    it('should contain index.html', async () => {
      const indexPath = `${buildResult.buildData.location}/index.html`
      const stat = await fs.stat(indexPath)
      assert.ok(stat.size > 0, 'index.html should exist and not be empty')
    })
  })

  describe('Publish', () => {
    let buildResult

    it('should publish a course without errors', async () => {
      buildResult = await framework.buildCourse({
        action: 'publish',
        courseId,
        userId: '000000000000000000000000'
      })
      assert.ok(buildResult, 'build should return a result')
      assert.ok(buildResult.buildData, 'result should include buildData')
    })

    it('should have created a zip file', async () => {
      const location = buildResult.buildData.location
      const stat = await fs.stat(location)
      assert.ok(stat.size > 1000, 'publish zip should have substantial content')
    })

    it('should have recorded build versions', async () => {
      assert.ok(buildResult.buildData.versions, 'buildData should include versions')
    })
  })
})
