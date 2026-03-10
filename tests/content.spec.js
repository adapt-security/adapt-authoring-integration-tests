import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { getApp, getModule, cleanDb } from '../lib/app.js'

let content
let authLocal
let createdBy

// ---------------------------------------------------------------------------
// Helper: build a course with a full content hierarchy for testing
// ---------------------------------------------------------------------------
async function createCourseHierarchy (opts = {}) {
  const v = false
  const cid = (id) => id.toString()
  const course = await content.insert(
    { _type: 'course', title: opts.title || 'Test Course', createdBy },
    { validate: v, schemaName: 'course' }
  )
  const courseId = cid(course._id)
  const config = await content.insert(
    { _type: 'config', _courseId: courseId, createdBy, _enabledPlugins: [], _menu: '', _theme: '' },
    { validate: v, schemaName: 'config' }
  )
  const page = await content.insert(
    { _type: 'page', title: 'Page', _parentId: courseId, _courseId: courseId, createdBy },
    { validate: v, schemaName: 'contentobject' }
  )
  const article = await content.insert(
    { _type: 'article', title: 'Article', _parentId: cid(page._id), _courseId: courseId, createdBy },
    { validate: v, schemaName: 'article' }
  )
  const block = await content.insert(
    { _type: 'block', title: 'Block', _parentId: cid(article._id), _courseId: courseId, createdBy },
    { validate: v, schemaName: 'block' }
  )
  return { course, config, page, article, block, courseId }
}

describe('Content CRUD operations', () => {
  before(async () => {
    await getApp()
    content = await getModule('content')
    authLocal = await getModule('auth-local')
    const user = await authLocal.register({
      email: 'content-test@example.com',
      firstName: 'Content',
      lastName: 'Tester',
      password: 'Password123!'
    })
    createdBy = user._id.toString()
  })

  after(async () => {
    await cleanDb(['content', 'users', 'authtokens'])
  })

  // ---------------------------------------------------------------------------
  // Course creation
  // ---------------------------------------------------------------------------
  describe('Course creation', () => {
    let course

    it('should insert a course content item', async () => {
      course = await content.insert(
        { _type: 'course', title: 'Test Course', createdBy },
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
        { _type: 'course', title: 'Hierarchy Course', createdBy },
        { validate: false, schemaName: 'course' }
      )
      page = await content.insert(
        { _type: 'page', title: 'Test Page', _parentId: course._id.toString(), _courseId: course._id.toString(), createdBy },
        { validate: false, schemaName: 'contentobject' }
      )
      article = await content.insert(
        { _type: 'article', title: 'Test Article', _parentId: page._id.toString(), _courseId: course._id.toString(), createdBy },
        { validate: false, schemaName: 'article' }
      )
      block = await content.insert(
        { _type: 'block', title: 'Test Block', _parentId: article._id.toString(), _courseId: course._id.toString(), createdBy },
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
        { _type: 'course', title: 'Query Course', createdBy },
        { validate: false, schemaName: 'course' }
      )
      courseId = course._id.toString()
      await content.insert(
        { _type: 'page', title: 'Page A', _parentId: courseId, _courseId: courseId, createdBy },
        { validate: false, schemaName: 'contentobject' }
      )
      await content.insert(
        { _type: 'page', title: 'Page B', _parentId: courseId, _courseId: courseId, createdBy },
        { validate: false, schemaName: 'contentobject' }
      )
      await content.insert(
        { _type: 'article', title: 'Article A', _parentId: courseId, _courseId: courseId, createdBy },
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
        { _type: 'course', title: 'Original Title', createdBy },
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
        { _type: 'course', title: 'To Be Deleted', createdBy },
        { validate: false, schemaName: 'course' }
      )
      const courseId = course._id.toString()

      await content.delete({ _id: course._id })

      const results = await content.find({ _id: courseId })
      assert.equal(results.length, 0, 'deleted course should not be found')
    })

    it('should delete all descendants when deleting a parent', async () => {
      const { course, page, article, block, courseId } = await createCourseHierarchy()

      await content.delete({ _id: page._id })

      const remaining = await content.find({ _courseId: courseId })
      const remainingIds = remaining.map(r => r._id.toString())
      assert.ok(!remainingIds.includes(page._id.toString()), 'page should be deleted')
      assert.ok(!remainingIds.includes(article._id.toString()), 'article should be deleted')
      assert.ok(!remainingIds.includes(block._id.toString()), 'block should be deleted')
      assert.ok(remainingIds.includes(course._id.toString()), 'course should remain')
    })

    it('should include config when deleting a course', async () => {
      const { course, courseId } = await createCourseHierarchy()

      await content.delete({ _id: course._id })

      const remaining = await content.find({ _courseId: courseId })
      assert.equal(remaining.length, 0, 'all content including config should be deleted')
    })
  })

  // ---------------------------------------------------------------------------
  // Clone
  // ---------------------------------------------------------------------------
  describe('Clone', () => {
    it('should recursively clone a subtree', async () => {
      const { page, courseId } = await createCourseHierarchy()

      const cloned = await content.clone(createdBy, page._id, page._parentId)

      assert.ok(cloned._id.toString() !== page._id.toString(), 'clone should have a new _id')
      assert.equal(cloned._type, 'page')
      assert.equal(cloned._courseId.toString(), courseId)

      // descendants should also be cloned
      const clonedChildren = await content.find({ _parentId: cloned._id })
      assert.equal(clonedChildren.length, 1, 'cloned page should have 1 article child')
      assert.equal(clonedChildren[0]._type, 'article')

      const clonedBlocks = await content.find({ _parentId: clonedChildren[0]._id })
      assert.equal(clonedBlocks.length, 1, 'cloned article should have 1 block child')
      assert.equal(clonedBlocks[0]._type, 'block')
    })

    it('should clone a full course with config', async () => {
      const { course } = await createCourseHierarchy()

      const clonedCourse = await content.clone(createdBy, course._id)

      assert.ok(clonedCourse._id.toString() !== course._id.toString())
      assert.equal(clonedCourse._type, 'course')

      const clonedItems = await content.find({ _courseId: clonedCourse._id })
      const types = clonedItems.map(i => i._type)
      assert.ok(types.includes('config'), 'cloned course should have a config')
      assert.ok(types.includes('page'), 'cloned course should have a page')
      assert.ok(types.includes('article'), 'cloned course should have an article')
      assert.ok(types.includes('block'), 'cloned course should have a block')
    })

    it('should set createdBy on cloned items', async () => {
      const { page, courseId } = await createCourseHierarchy()

      const cloned = await content.clone(createdBy, page._id, page._parentId)

      const clonedItems = await content.find({ _courseId: courseId, _parentId: cloned._id })
      for (const item of clonedItems) {
        assert.equal(item.createdBy.toString(), createdBy)
      }
    })
  })

  // ---------------------------------------------------------------------------
  // Sort order
  // ---------------------------------------------------------------------------
  describe('Sort order', () => {
    it('should assign _sortOrder to siblings on insert', async () => {
      const { page, courseId } = await createCourseHierarchy()
      const pageId = page._id.toString()

      await content.insert(
        { _type: 'article', title: 'A1', _parentId: pageId, _courseId: courseId, createdBy },
        { validate: false, schemaName: 'article' }
      )
      await content.insert(
        { _type: 'article', title: 'A2', _parentId: pageId, _courseId: courseId, createdBy },
        { validate: false, schemaName: 'article' }
      )

      const articles = await content.find(
        { _parentId: pageId, _type: 'article' },
        {},
        { sort: { _sortOrder: 1 } }
      )
      assert.ok(articles.length >= 2, 'should have at least 2 articles')
      for (let i = 0; i < articles.length; i++) {
        assert.equal(articles[i]._sortOrder, i + 1, `article ${i} should have _sortOrder ${i + 1}`)
      }
    })
  })
})
