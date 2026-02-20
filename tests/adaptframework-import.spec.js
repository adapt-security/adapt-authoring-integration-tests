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
      assert.equal(items.length, 5, 'should have 5 content objects')
      for (const item of items) {
        assert.ok(item.title, `${item._type} "${item._id}" should have a title`)
        assert.ok(item._parentId, `${item._type} "${item._id}" should have a _parentId`)
        assert.ok(typeof item._sortOrder === 'number', `${item._type} "${item._id}" should have a numeric _sortOrder`)
      }
    })

    it('should have created articles', async () => {
      const items = await content.find({ _courseId: summary.courseId, _type: 'article' })
      assert.equal(items.length, 5, 'should have 5 articles')
      const pageIds = new Set(
        (await content.find({ _courseId: summary.courseId, _type: { $in: ['page', 'menu'] } }))
          .map(p => p._id.toString())
      )
      for (const item of items) {
        assert.ok(item.title, `article "${item._id}" should have a title`)
        assert.ok(pageIds.has(item._parentId?.toString()), `article "${item._id}" should have a content object as parent`)
      }
    })

    it('should have created blocks', async () => {
      const items = await content.find({ _courseId: summary.courseId, _type: 'block' })
      assert.equal(items.length, 23, 'should have 23 blocks')
      const articleIds = new Set(
        (await content.find({ _courseId: summary.courseId, _type: 'article' }))
          .map(a => a._id.toString())
      )
      for (const item of items) {
        assert.ok(item.title, `block "${item._id}" should have a title`)
        assert.ok(articleIds.has(item._parentId?.toString()), `block "${item._id}" should have an article as parent`)
      }
    })

    it('should have created components', async () => {
      const items = await content.find({ _courseId: summary.courseId, _type: 'component' })
      assert.equal(items.length, 23, 'should have 23 components')
      const blockIds = new Set(
        (await content.find({ _courseId: summary.courseId, _type: 'block' }))
          .map(b => b._id.toString())
      )
      for (const item of items) {
        assert.ok(item._component, `component "${item._id}" should have a _component type`)
        assert.ok(item._layout, `component "${item._id}" should have a _layout`)
        assert.ok(blockIds.has(item._parentId?.toString()), `component "${item._id}" should have a block as parent`)
      }
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
      assert.equal(summary.content.course, 1, 'should count 1 course')
      assert.equal(summary.content.config, 1, 'should count 1 config')
      assert.equal(summary.content.page, 5, 'should count 5 pages')
      assert.equal(summary.content.article, 5, 'should count 5 articles')
      assert.equal(summary.content.block, 23, 'should count 23 blocks')
      assert.equal(summary.content.component, 23, 'should count 23 components')
    })

    it('should report plugin versions in summary', async () => {
      assert.ok(Array.isArray(summary.versions), 'summary should include versions array')
      assert.ok(summary.versions.length > 0, 'should have at least one version entry')
      const fw = summary.versions.find(v => v.name === 'adapt_framework')
      assert.ok(fw, 'should include adapt_framework version')
      assert.ok(Array.isArray(fw.versions), 'version entry should have versions array')
      assert.equal(fw.versions.length, 2, 'version entry should have installed and import versions')
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
