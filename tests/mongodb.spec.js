import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { getApp, getModule } from '../lib/app.js'

const COLLECTION = 'integrationtest'

let mongodb

describe('MongoDB core operations', () => {
  before(async () => {
    await getApp()
    mongodb = await getModule('mongodb')
  })

  after(async () => {
    try { await mongodb.getCollection(COLLECTION).drop() } catch {}
  })

  describe('Insert & Find', () => {
    let insertedId

    it('should insert a document and return an _id', async () => {
      const result = await mongodb.insert(COLLECTION, { name: 'Alice', score: 42 })
      assert.ok(result._id, 'inserted document should have an _id')
      insertedId = result._id
    })

    it('should find the document by _id with matching fields', async () => {
      const [doc] = await mongodb.find(COLLECTION, { _id: insertedId })
      assert.ok(doc, 'document should be found')
      assert.equal(doc.name, 'Alice')
      assert.equal(doc.score, 42)
    })
  })

  describe('Insert Multiple', () => {
    it('should insert multiple documents individually and find them all', async () => {
      await mongodb.insert(COLLECTION, { name: 'Bob', score: 10 })
      await mongodb.insert(COLLECTION, { name: 'Carol', score: 20 })
      await mongodb.insert(COLLECTION, { name: 'Dave', score: 30 })

      const found = await mongodb.find(COLLECTION, { name: { $in: ['Bob', 'Carol', 'Dave'] } })
      assert.equal(found.length, 3, 'should find all three documents')
    })
  })

  describe('Update', () => {
    let docId

    it('should update a field on an existing document', async () => {
      const inserted = await mongodb.insert(COLLECTION, { name: 'Eve', score: 50 })
      docId = inserted._id

      await mongodb.update(COLLECTION, { _id: docId }, { score: 99 })

      const [updated] = await mongodb.find(COLLECTION, { _id: docId })
      assert.equal(updated.score, 99, 'score should be updated to 99')
      assert.equal(updated.name, 'Eve', 'name should remain unchanged')
    })
  })

  describe('Delete', () => {
    it('should delete a document so it can no longer be found', async () => {
      const inserted = await mongodb.insert(COLLECTION, { name: 'Frank', score: 0 })

      await mongodb.delete(COLLECTION, { _id: inserted._id })

      const results = await mongodb.find(COLLECTION, { _id: inserted._id })
      assert.equal(results.length, 0, 'deleted document should not be found')
    })
  })

  describe('Query Operators', () => {
    before(async () => {
      await mongodb.insert(COLLECTION, { group: 'queries', label: 'low', value: 5 })
      await mongodb.insert(COLLECTION, { group: 'queries', label: 'mid', value: 15 })
      await mongodb.insert(COLLECTION, { group: 'queries', label: 'high', value: 25 })
    })

    it('should support $gt operator', async () => {
      const results = await mongodb.find(COLLECTION, { group: 'queries', value: { $gt: 10 } })
      assert.equal(results.length, 2, 'should find two documents with value > 10')
    })

    it('should support $in operator', async () => {
      const results = await mongodb.find(COLLECTION, { group: 'queries', label: { $in: ['low', 'high'] } })
      assert.equal(results.length, 2, 'should find two documents matching $in')
      const labels = results.map(r => r.label).sort()
      assert.deepEqual(labels, ['high', 'low'])
    })

    it('should support $regex operator', async () => {
      const results = await mongodb.find(COLLECTION, { group: 'queries', label: { $regex: '^h' } })
      assert.equal(results.length, 1, 'should find one document matching regex')
      assert.equal(results[0].label, 'high')
    })
  })

  describe('Collection Access', () => {
    it('should return a usable collection object from getCollection()', async () => {
      const collection = mongodb.getCollection(COLLECTION)
      assert.ok(collection, 'getCollection should return an object')
      assert.equal(typeof collection.find, 'function', 'collection should have a find method')
      assert.equal(typeof collection.insertOne, 'function', 'collection should have an insertOne method')

      const count = await collection.countDocuments({})
      assert.ok(count > 0, 'collection should contain documents from previous tests')
    })
  })
})
