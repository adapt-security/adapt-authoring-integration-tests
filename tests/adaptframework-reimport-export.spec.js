import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs/promises'
import JSZip from 'jszip'
import { getApp, getModule, cleanDb } from '../lib/app.js'
import { getFixture } from '../lib/fixtures.js'

const USER_ID = '000000000000000000000000'
const OBJECTID = /^[0-9a-f]{24}$/

let framework
let content
let assets
let tags

async function importFixture () {
  const importer = await framework.importCourse({
    importPath: await getFixture('course-export'),
    userId: USER_ID,
    tags: [],
    importContent: true,
    importPlugins: true,
    migrateContent: true,
    updatePlugins: false,
    removeSource: false
  })
  return importer.summary
}

describe('AdaptFramework export re-import roundtrip', () => {
  let firstCourseId
  let exportZipPath

  before(async () => {
    await getApp()
    framework = await getModule('adaptframework')
    content = await getModule('content')
    assets = await getModule('assets')
    tags = await getModule('tags')
    firstCourseId = (await importFixture()).courseId.toString()
  })

  after(async () => {
    await cleanDb()
  })

  it('should export the imported course to a zip', async () => {
    const build = await framework.buildCourse({ action: 'export', courseId: firstCourseId, userId: USER_ID })
    exportZipPath = build.buildData.location
    const stat = await fs.stat(exportZipPath)
    assert.ok(stat.size > 1000, 'export zip should have substantial content')
  })

  it('should not write _assetIds into the exported content (#200)', async () => {
    const zip = await JSZip.loadAsync(await fs.readFile(exportZipPath))
    const contentFiles = Object.keys(zip.files).filter(name =>
      /\/course\/.+\.json$/.test(name) && !name.endsWith('assets.json')
    )
    assert.ok(contentFiles.length, 'export should contain course content json')
    for (const name of contentFiles) {
      const text = await zip.files[name].async('string')
      assert.ok(!text.includes('"_assetIds"'), `${name} should not contain the derived _assetIds cache`)
    }
  })

  it('should re-import the exported zip as a separate course', async () => {
    // Tags are regenerated with fresh _ids on re-import while assets dedupe by
    // content hash, leaving the persisted assets' tag refs orphaned (#212).
    await cleanDb(['tags'])
    const importer = await framework.importCourse({
      importPath: exportZipPath,
      userId: USER_ID,
      tags: [],
      importContent: true,
      importPlugins: true,
      migrateContent: true,
      updatePlugins: false,
      removeSource: false
    })
    const secondCourseId = importer.summary.courseId.toString()
    assert.ok(secondCourseId, 're-import should create a course')
    assert.notEqual(secondCourseId, firstCourseId, 'should be a different course')
  })

  it('should store _assetIds as ObjectIds, not paths, after re-import (#200)', async () => {
    const items = await content.find({ _assetIds: { $exists: true, $ne: [] } })
    assert.ok(items.length, 'some content should reference assets')
    for (const item of items) {
      for (const id of item._assetIds) {
        assert.match(id.toString(), OBJECTID, `${item._type} "${item._id}" has a non-ObjectId _assetIds entry`)
      }
    }
  })

  it('should leave no orphaned asset tag references after re-import (#212)', async () => {
    const tagIds = new Set((await tags.find({})).map(t => t._id.toString()))
    const tagged = (await assets.find({})).filter(a => a.tags?.length)
    assert.ok(tagged.length, 'fixture assets should carry tags')
    for (const asset of tagged) {
      for (const tagId of asset.tags) {
        assert.ok(tagIds.has(tagId.toString()), `asset "${asset._id}" references missing tag "${tagId}"`)
      }
    }
  })

  it('should export the re-imported course without crashing on tags (#212)', async () => {
    const reimported = (await content.find({ _type: 'course' })).find(c => c._id.toString() !== firstCourseId)
    const build = await framework.buildCourse({ action: 'export', courseId: reimported._id.toString(), userId: USER_ID })
    const stat = await fs.stat(build.buildData.location)
    assert.ok(stat.size > 1000, 'export of the re-imported course should succeed')
  })
})
