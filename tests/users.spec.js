import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { getApp, getModule, cleanDb } from '../lib/app.js'

let users
let authLocal

describe('Users module', () => {
  before(async () => {
    await getApp()
    users = await getModule('users')
    authLocal = await getModule('auth-local')
  })

  after(async () => {
    await cleanDb(['users', 'authtokens', 'passwordresets'])
  })

  describe('User creation', () => {
    it('should create a user via authLocal.register()', async () => {
      const user = await authLocal.register({
        email: 'create-test@example.com',
        firstName: 'Create',
        lastName: 'Test',
        password: 'Password123!'
      })
      assert.ok(user, 'register should return a user object')
      assert.ok(user._id, 'user should have an _id')
    })

    it('should be retrievable via users.find()', async () => {
      const results = await users.find({ email: 'create-test@example.com' })
      assert.equal(results.length, 1, 'should find exactly one user')
      assert.equal(results[0].firstName, 'Create')
      assert.equal(results[0].lastName, 'Test')
    })
  })

  describe('Email case insensitivity', () => {
    it('should create a user with mixed case email', async () => {
      const user = await authLocal.register({
        email: 'MixedCase@Example.COM',
        firstName: 'Mixed',
        lastName: 'Case',
        password: 'Password123!'
      })
      assert.ok(user._id, 'user should be created')
    })

    it('should store the email as lowercase', async () => {
      const results = await users.find({ email: 'mixedcase@example.com' })
      assert.equal(results.length, 1, 'should find the user with lowercase email')
      assert.equal(results[0].email, 'mixedcase@example.com', 'stored email should be lowercase')
    })

    it('should find the user when querying with different case', async () => {
      const results = await users.find({ email: 'MIXEDCASE@EXAMPLE.COM' })
      assert.equal(results.length, 1, 'should find the user regardless of query case')
      assert.equal(results[0].firstName, 'Mixed')
    })
  })

  describe('Duplicate email', () => {
    it('should reject a second user with the same email', async () => {
      await assert.rejects(
        () => authLocal.register({
          email: 'create-test@example.com',
          firstName: 'Duplicate',
          lastName: 'User',
          password: 'Password123!'
        }),
        (err) => {
          const isDuplError = err.code === 'DUPL_USER' ||
            err.code === 'MONGO_DUPL_INDEX' ||
            /dupl/i.test(err.message) ||
            /E11000/i.test(err.message)
          assert.ok(isDuplError, `expected a duplicate error, got: ${err.code || err.message}`)
          return true
        }
      )
    })
  })

  describe('User update', () => {
    it('should update a user firstName', async () => {
      const [user] = await users.find({ email: 'create-test@example.com' })
      await users.update({ _id: user._id }, { firstName: 'Updated' })
      const [updated] = await users.find({ _id: user._id })
      assert.equal(updated.firstName, 'Updated', 'firstName should be updated')
    })
  })

  describe('User deletion', () => {
    let deleteEmail = 'delete-me@example.com'

    it('should create a user to be deleted', async () => {
      const user = await authLocal.register({
        email: deleteEmail,
        firstName: 'Delete',
        lastName: 'Me',
        password: 'Password123!'
      })
      assert.ok(user._id, 'user should be created')
    })

    it('should delete the user', async () => {
      const [user] = await users.find({ email: deleteEmail })
      await users.delete({ _id: user._id })
      const results = await users.find({ email: deleteEmail })
      assert.equal(results.length, 0, 'user should no longer exist after deletion')
    })
  })
})
