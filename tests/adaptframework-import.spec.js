import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { getApp, getModule, cleanDb } from '../lib/app.js'
import { getFixture } from '../lib/fixtures.js'

let framework
let content

describe('AdaptFramework import', () => {
  before(async () => {
    await getApp()
    framework = await getModule('adaptframework')
    content = await getModule('content')
  })

  after(async () => {
    await cleanDb()
  })

  describe('Course import from zip', () => {
    let summary

    it('should import a course zip without errors', async () => {
      const importer = await framework.importCourse({
        importPath: await getFixture('course-export'),
        userId: '000000000000000000000000',
        tags: [],
        importContent: true,
        importPlugins: true,
        migrateContent: true,
        updatePlugins: false,
        removeSource: false
      })
      summary = importer.summary
      assert.ok(summary, 'import should return a summary')
      assert.ok(summary.courseId, 'summary should include a courseId')
      assert.ok(summary.title, 'summary should include a title')
    })

    it('should have created the course in the database', async () => {
      const [course] = await content.find({ _id: summary.courseId })
      assert.ok(course, 'course should exist in database')
      assert.equal(course._type, 'course')
    })

    it('should have created a config', async () => {
      const [config] = await content.find({ _courseId: summary.courseId, _type: 'config' })
      assert.ok(config, 'config should exist')
      assert.ok(config._defaultLanguage, 'config should have _defaultLanguage')
    })

    it('should have created content objects', async () => {
      const items = await content.find({ _courseId: summary.courseId, _type: { $in: ['page', 'menu'] } })
      assert.ok(items.length > 0, 'should have at least one content object')
    })

    it('should have created articles', async () => {
      const items = await content.find({ _courseId: summary.courseId, _type: 'article' })
      assert.ok(items.length > 0, 'should have at least one article')
    })

    it('should have created blocks', async () => {
      const items = await content.find({ _courseId: summary.courseId, _type: 'block' })
      assert.ok(items.length > 0, 'should have at least one block')
    })

    it('should have created components', async () => {
      const items = await content.find({ _courseId: summary.courseId, _type: 'component' })
      assert.ok(items.length > 0, 'should have at least one component')
    })

    it('should have valid parent-child relationships', async () => {
      const allContent = await content.find({ _courseId: summary.courseId })
      const ids = new Set(allContent.map(c => c._id.toString()))
      ids.add(summary.courseId.toString())

      for (const item of allContent) {
        if (item._type === 'course' || item._type === 'config') continue
        assert.ok(
          ids.has(item._parentId?.toString()),
          `${item._type} "${item._id}" has invalid _parentId "${item._parentId}"`
        )
      }
    })

    it('should report content counts in summary', async () => {
      assert.ok(summary.content, 'summary should include content counts')
      assert.ok(summary.content.course > 0, 'should count course')
    })

    it('should report plugin versions in summary', async () => {
      assert.ok(Array.isArray(summary.versions), 'summary should include versions array')
      assert.ok(summary.versions.length > 0, 'should have at least one version entry')
      const fw = summary.versions.find(v => v.name === 'adapt_framework')
      assert.ok(fw, 'should include adapt_framework version')
    })
  })

  describe('Course re-import', () => {
    let firstCourseId
    let secondCourseId

    before(async () => {
      const [course] = await content.find({ _type: 'course' })
      firstCourseId = course._id.toString()
    })

    it('should create a separate course on re-import', async () => {
      const importer = await framework.importCourse({
        importPath: await getFixture('course-export'),
        userId: '000000000000000000000000',
        tags: [],
        importContent: true,
        importPlugins: true,
        migrateContent: true,
        updatePlugins: false,
        removeSource: false
      })
      secondCourseId = importer.summary.courseId.toString()
      assert.ok(secondCourseId, 'should have a courseId')
      assert.notEqual(secondCourseId, firstCourseId, 'should be a different course')
    })

    it('should have two courses in the database', async () => {
      const courses = await content.find({ _type: 'course' })
      assert.ok(courses.length >= 2, 'should have at least two courses')
    })
  })

  describe('Dry run import', () => {
    let courseCountBefore

    before(async () => {
      const courses = await content.find({ _type: 'course' })
      courseCountBefore = courses.length
    })

    it('should not create content when isDryRun is true', async () => {
      const importer = await framework.importCourse({
        importPath: await getFixture('course-export'),
        userId: '000000000000000000000000',
        tags: [],
        isDryRun: true,
        importContent: true,
        importPlugins: true,
        migrateContent: true,
        updatePlugins: false,
        removeSource: false
      })
      assert.ok(importer.summary, 'should still return a summary')

      const courses = await content.find({ _type: 'course' })
      assert.equal(courses.length, courseCountBefore, 'should not have created a new course')
    })
  })
})
