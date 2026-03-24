import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { getApp, getModule, cleanDb } from '../lib/app.js'
import { getFixture } from '../lib/fixtures.js'

let framework
let content
let assets
let courseId

describe('Content asset tracking', () => {
  before(async () => {
    await getApp()
    framework = await getModule('adaptframework')
    content = await getModule('content')
    assets = await getModule('assets')

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
    courseId = importer.summary.courseId.toString()
  })

  after(async () => {
    await cleanDb()
  })

  // ---------------------------------------------------------------------------
  // _assetIds population
  // ---------------------------------------------------------------------------
  describe('_assetIds population', () => {
    it('should have _assetIds as an array on all content items', async () => {
      const items = await content.find({ _courseId: courseId })
      for (const item of items) {
        assert.ok(
          Array.isArray(item._assetIds),
          `${item._type} "${item._id}" should have _assetIds array`
        )
      }
    })

    it('should populate _assetIds on content items that reference assets', async () => {
      const items = await content.find({ _courseId: courseId })
      const withAssets = items.filter(i => i._assetIds?.length > 0)
      assert.ok(withAssets.length > 0, 'at least one content item should have populated _assetIds')
    })

    it('should contain valid asset IDs that exist in the assets collection', async () => {
      const items = await content.find({ _courseId: courseId })
      const allAssetIds = [...new Set(items.flatMap(i => i._assetIds || []))]
      assert.ok(allAssetIds.length > 0, 'should have at least one asset ID across all content')
      for (const assetId of allAssetIds) {
        const [asset] = await assets.find({ _id: assetId })
        assert.ok(asset, `asset "${assetId}" referenced in _assetIds should exist in assets collection`)
      }
    })
  })

  // ---------------------------------------------------------------------------
  // Asset deletion guard
  // ---------------------------------------------------------------------------
  describe('Asset deletion guard', () => {
    it('should reject deletion of an asset referenced by content', async () => {
      const items = await content.find({ _courseId: courseId })
      const withAssets = items.filter(i => i._assetIds?.length > 0)
      assert.ok(withAssets.length > 0, 'precondition: need content with _assetIds')

      const assetId = withAssets[0]._assetIds[0]
      await assert.rejects(
        () => assets.delete({ _id: assetId }),
        (err) => {
          assert.ok(
            err.code === 'RESOURCE_IN_USE' || err.message?.includes('RESOURCE_IN_USE'),
            `expected RESOURCE_IN_USE, got: ${err.code || err.message}`
          )
          return true
        }
      )
    })

    it('should include course titles in the error data', async () => {
      const items = await content.find({ _courseId: courseId })
      const withAssets = items.filter(i => i._assetIds?.length > 0)
      const assetId = withAssets[0]._assetIds[0]

      const [course] = await content.find({ _id: courseId })
      const expectedTitle = course.displayTitle || course.title

      try {
        await assets.delete({ _id: assetId })
        assert.fail('should have thrown RESOURCE_IN_USE')
      } catch (err) {
        assert.ok(err.data?.courses, 'error should have courses in data')
        assert.ok(
          err.data.courses.includes(expectedTitle),
          `error courses should include "${expectedTitle}"`
        )
      }
    })

    it('should allow deletion after content references are removed', async () => {
      const items = await content.find({ _courseId: courseId })
      const withAssets = items.filter(i => i._assetIds?.length > 0)
      const assetId = withAssets[0]._assetIds[0]

      // Clear _assetIds on all content referencing this asset
      const referencing = items.filter(i => i._assetIds?.includes(assetId))
      const mongodb = await getModule('mongodb')
      const collection = mongodb.getCollection('content')
      for (const item of referencing) {
        const updated = item._assetIds.filter(id => id !== assetId)
        await collection.updateOne({ _id: item._id }, { $set: { _assetIds: updated } })
      }

      // Deletion should now succeed
      const result = await assets.delete({ _id: assetId })
      assert.ok(result, 'should have deleted the asset')
    })
  })
})
