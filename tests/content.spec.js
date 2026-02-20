import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { getApp, getModule, cleanDb } from '../lib/app.js'

let content

describe('Content CRUD operations', () => {
  before(async () => {
    await getApp()
    content = await getModule('content')
  })

  after(async () => {
    await cleanDb(['content'])
  })

  // ---------------------------------------------------------------------------
  // Course creation
  // ---------------------------------------------------------------------------
  describe('Course creation', () => {
    let course

    it('should insert a course content item', async () => {
      course = await content.insert(
        { _type: 'course', title: 'Test Course' },
        { validate: false, schemaName: 'course' }
      )
      assert.ok(course, 'insert should return a document')
      assert.ok(course._id, 'course should have an _id')
      assert.equal(course._type, 'course')
      assert.equal(course.title, 'Test Course')
    })

    it('should have set _courseId to its own _id', async () => {
      assert.ok(course._courseId, 'course should have _courseId')
      assert.equal(
        course._courseId.toString(),
        course._id.toString(),
        '_courseId should equal _id for a course'
      )
    })

    it('should be retrievable via find', async () => {
      const [found] = await content.find({ _id: course._id })
      assert.ok(found, 'course should be found in the database')
      assert.equal(found._type, 'course')
      assert.equal(found.title, 'Test Course')
    })
  })

  // ---------------------------------------------------------------------------
  // Content hierarchy
  // ---------------------------------------------------------------------------
  describe('Content hierarchy', () => {
    let course, page, article, block

    before(async () => {
      course = await content.insert(
        { _type: 'course', title: 'Hierarchy Course' },
        { validate: false, schemaName: 'course' }
      )
      page = await content.insert(
        { _type: 'page', title: 'Test Page', _parentId: course._id.toString(), _courseId: course._id.toString() },
        { validate: false, schemaName: 'contentobject' }
      )
      article = await content.insert(
        { _type: 'article', title: 'Test Article', _parentId: page._id.toString(), _courseId: course._id.toString() },
        { validate: false, schemaName: 'article' }
      )
      block = await content.insert(
        { _type: 'block', title: 'Test Block', _parentId: article._id.toString(), _courseId: course._id.toString() },
        { validate: false, schemaName: 'block' }
      )
    })

    it('should create a page with the course as parent', async () => {
      assert.ok(page._id, 'page should have an _id')
      assert.equal(page._parentId.toString(), course._id.toString())
      assert.equal(page._courseId.toString(), course._id.toString())
    })

    it('should create an article with the page as parent', async () => {
      assert.ok(article._id, 'article should have an _id')
      assert.equal(article._parentId.toString(), page._id.toString())
      assert.equal(article._courseId.toString(), course._id.toString())
    })

    it('should create a block with the article as parent', async () => {
      assert.ok(block._id, 'block should have an _id')
      assert.equal(block._parentId.toString(), article._id.toString())
      assert.equal(block._courseId.toString(), course._id.toString())
    })
  })

  // ---------------------------------------------------------------------------
  // Content query by _type
  // ---------------------------------------------------------------------------
  describe('Content query', () => {
    let courseId

    before(async () => {
      const course = await content.insert(
        { _type: 'course', title: 'Query Course' },
        { validate: false, schemaName: 'course' }
      )
      courseId = course._id.toString()
      await content.insert(
        { _type: 'page', title: 'Page A', _parentId: courseId, _courseId: courseId },
        { validate: false, schemaName: 'contentobject' }
      )
      await content.insert(
        { _type: 'page', title: 'Page B', _parentId: courseId, _courseId: courseId },
        { validate: false, schemaName: 'contentobject' }
      )
      await content.insert(
        { _type: 'article', title: 'Article A', _parentId: courseId, _courseId: courseId },
        { validate: false, schemaName: 'article' }
      )
    })

    it('should find only pages when querying by _type "page"', async () => {
      const pages = await content.find({ _courseId: courseId, _type: 'page' })
      assert.equal(pages.length, 2, 'should find exactly 2 pages')
      assert.ok(pages.every(p => p._type === 'page'), 'all results should be pages')
    })

    it('should find items using $in operator on _type', async () => {
      const items = await content.find({ _courseId: courseId, _type: { $in: ['page', 'article'] } })
      assert.equal(items.length, 3, 'should find 2 pages + 1 article = 3 items')
    })
  })

  // ---------------------------------------------------------------------------
  // Content update
  // ---------------------------------------------------------------------------
  describe('Content update', () => {
    it('should update a content item title', async () => {
      const course = await content.insert(
        { _type: 'course', title: 'Original Title' },
        { validate: false, schemaName: 'course' }
      )
      const updated = await content.update(
        { _id: course._id },
        { title: 'Updated Title' },
        { validate: false }
      )
      assert.equal(updated.title, 'Updated Title')
      assert.equal(updated._id.toString(), course._id.toString(), '_id should remain the same')
    })
  })

  // ---------------------------------------------------------------------------
  // Content deletion
  // ---------------------------------------------------------------------------
  describe('Content deletion', () => {
    it('should delete a content item and verify removal', async () => {
      const course = await content.insert(
        { _type: 'course', title: 'To Be Deleted' },
        { validate: false, schemaName: 'course' }
      )
      const courseId = course._id.toString()

      await content.delete({ _id: course._id })

      const results = await content.find({ _id: courseId })
      assert.equal(results.length, 0, 'deleted course should not be found')
    })
  })
})
