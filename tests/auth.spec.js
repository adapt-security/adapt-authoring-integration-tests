import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { getApp, getModule, cleanDb } from '../lib/app.js'
import { AuthToken } from 'adapt-authoring-auth'

let auth
let authLocal
let roles
let users
let mongodb

const testPassword = 'T3stP@ssword!'
const testEmail = 'testuser@example.com'
const superEmail = 'super@example.com'

describe('Authentication system', () => {
  before(async () => {
    await getApp()
    auth = await getModule('auth')
    authLocal = await getModule('auth-local')
    roles = await getModule('roles')
    users = await getModule('users')
    mongodb = await getModule('mongodb')
  })

  after(async () => {
    await cleanDb(['users', 'authtokens', 'passwordresets'])
  })

  describe('User Registration', () => {
    let registeredUser

    it('should register a new user via auth-local', async () => {
      const [authorRole] = await roles.find({ shortName: 'contentcreator' })
      registeredUser = await authLocal.register({
        email: testEmail,
        firstName: 'Test',
        lastName: 'User',
        password: testPassword,
        roles: [authorRole._id.toString()]
      })
      assert.ok(registeredUser, 'register should return user data')
      assert.ok(registeredUser._id, 'user should have an _id')
    })

    it('should persist the user in the database', async () => {
      const [dbUser] = await users.find({ _id: registeredUser._id })
      assert.ok(dbUser, 'user should exist in database')
      assert.equal(dbUser.email, testEmail, 'email should match')
      assert.equal(dbUser.firstName, 'Test', 'firstName should match')
      assert.equal(dbUser.lastName, 'User', 'lastName should match')
    })

    it('should store a hashed password, not plain text', async () => {
      const [dbUser] = await mongodb.find('users', { _id: registeredUser._id })
      assert.ok(dbUser.password, 'user record should have a password field')
      assert.notEqual(dbUser.password, testPassword, 'password should not be stored in plain text')
      assert.ok(dbUser.password.startsWith('$2'), 'password should be a bcrypt hash')
    })

    it('should set default auth fields on the user', async () => {
      const [dbUser] = await mongodb.find('users', { _id: registeredUser._id })
      assert.equal(dbUser.authType, 'local', 'authType should be "local"')
      assert.equal(dbUser.isEnabled, true, 'user should be enabled by default')
    })
  })

  describe('Super User', () => {
    it('should register a super user', async () => {
      await authLocal.registerSuper({
        email: superEmail,
        password: testPassword
      })
      const [superRole] = await roles.find({ shortName: 'superuser' })
      const superUsers = await users.find({ roles: [superRole._id] })
      assert.ok(superUsers.length >= 1, 'at least one super user should exist')
      const superUser = superUsers.find(u => u.email === superEmail)
      assert.ok(superUser, 'super user should exist with the registered email')
    })

    it('should reject a second super user registration with SUPER_USER_EXISTS', async () => {
      await assert.rejects(
        () => authLocal.registerSuper({
          email: 'super2@example.com',
          password: testPassword
        }),
        (err) => {
          assert.ok(
            err.code === 'SUPER_USER_EXISTS' || err.id === 'SUPER_USER_EXISTS' ||
            (err.message && err.message.includes('SUPER_USER_EXISTS')) ||
            (err.data && err.data.code === 'SUPER_USER_EXISTS'),
            `expected SUPER_USER_EXISTS error, got: ${err.code || err.id || err.message}`
          )
          return true
        }
      )
    })
  })

  describe('Token Lifecycle', () => {
    let tokenUser
    let token
    let tokenSignature

    before(async () => {
      const [authorRole] = await roles.find({ shortName: 'contentcreator' })
      tokenUser = await authLocal.register({
        email: 'tokenuser@example.com',
        firstName: 'Token',
        lastName: 'User',
        password: testPassword,
        roles: [authorRole._id.toString()]
      })
    })

    it('should generate a token for a user', async () => {
      token = await AuthToken.generate('local', tokenUser)
      assert.ok(token, 'should return a token string')
      assert.equal(typeof token, 'string', 'token should be a string')
      tokenSignature = AuthToken.getSignature(token)
      assert.ok(tokenSignature, 'token should have a signature')
    })

    it('should store the token in the database', async () => {
      const dbTokens = await mongodb.find('authtokens', { userId: tokenUser._id })
      assert.ok(dbTokens.length > 0, 'should have at least one token in the database')
      const matchingToken = dbTokens.find(t => t.signature === tokenSignature)
      assert.ok(matchingToken, 'stored token should match the generated signature')
      assert.equal(matchingToken.authType, 'local', 'token authType should be "local"')
    })

    it('should decode a valid token', async () => {
      const decoded = await AuthToken.decode(token)
      assert.ok(decoded, 'decode should return data')
      assert.equal(decoded.sub, tokenUser.email, 'decoded sub should match user email')
      assert.equal(decoded.signature, tokenSignature, 'decoded signature should match')
    })

    it('should revoke a token and remove it from the database', async () => {
      await AuthToken.revoke({ signature: tokenSignature })
      const dbTokens = await mongodb.find('authtokens', { signature: tokenSignature })
      assert.equal(dbTokens.length, 0, 'revoked token should no longer exist in database')
    })

    it('should reject decoding a revoked token', async () => {
      await assert.rejects(
        () => AuthToken.decode(token),
        'decoding a revoked token should throw'
      )
    })
  })

  describe('Token Revocation via disavowUser', () => {
    let disavowTestUser

    before(async () => {
      const [authorRole] = await roles.find({ shortName: 'contentcreator' })
      disavowTestUser = await authLocal.register({
        email: 'disavow@example.com',
        firstName: 'Disavow',
        lastName: 'User',
        password: testPassword,
        roles: [authorRole._id.toString()]
      })
      // Generate multiple tokens for this user
      await AuthToken.generate('local', disavowTestUser)
      await AuthToken.generate('local', disavowTestUser)
    })

    it('should have multiple tokens before disavow', async () => {
      const tokens = await mongodb.find('authtokens', { userId: disavowTestUser._id })
      assert.ok(tokens.length >= 2, 'user should have at least 2 tokens')
    })

    it('should revoke all tokens for a user via disavowUser', async () => {
      await auth.authentication.disavowUser({ userId: disavowTestUser._id })
      const tokens = await mongodb.find('authtokens', { userId: disavowTestUser._id })
      assert.equal(tokens.length, 0, 'all tokens should be revoked after disavow')
    })
  })

  describe('Account Lockout', () => {
    let lockUser

    before(async () => {
      const [authorRole] = await roles.find({ shortName: 'contentcreator' })
      lockUser = await authLocal.register({
        email: 'lockuser@example.com',
        firstName: 'Lock',
        lastName: 'User',
        password: testPassword,
        roles: [authorRole._id.toString()]
      })
    })

    it('should start with zero failed login attempts', async () => {
      const [dbUser] = await mongodb.find('users', { _id: lockUser._id })
      assert.equal(dbUser.failedLoginAttempts, 0, 'failedLoginAttempts should start at 0')
      assert.equal(dbUser.isTempLocked, false, 'isTempLocked should start as false')
      assert.equal(dbUser.isPermLocked, false, 'isPermLocked should start as false')
    })

    it('should reflect temporary lock state after updating failedLoginAttempts', async () => {
      await authLocal.updateUser(lockUser._id, {
        failedLoginAttempts: 5,
        isTempLocked: true,
        lastFailedLoginAttempt: new Date().toISOString()
      })
      const [dbUser] = await mongodb.find('users', { _id: lockUser._id })
      assert.equal(dbUser.failedLoginAttempts, 5, 'failedLoginAttempts should be 5')
      assert.equal(dbUser.isTempLocked, true, 'isTempLocked should be true')
      assert.equal(dbUser.isPermLocked, false, 'isPermLocked should still be false')
    })

    it('should reflect permanent lock state after exceeding threshold', async () => {
      await authLocal.updateUser(lockUser._id, {
        failedLoginAttempts: 20,
        isPermLocked: true,
        isTempLocked: false
      })
      const [dbUser] = await mongodb.find('users', { _id: lockUser._id })
      assert.equal(dbUser.failedLoginAttempts, 20, 'failedLoginAttempts should be 20')
      assert.equal(dbUser.isPermLocked, true, 'isPermLocked should be true')
    })

    it('should reset all lock fields when re-enabled via setUserEnabled', async () => {
      const [lockedUser] = await users.find({ _id: lockUser._id })
      await authLocal.setUserEnabled(lockedUser, true)
      const [dbUser] = await mongodb.find('users', { _id: lockUser._id })
      assert.equal(dbUser.isEnabled, true, 'user should be enabled')
      assert.equal(dbUser.failedLoginAttempts, 0, 'failedLoginAttempts should be reset to 0')
      assert.equal(dbUser.isPermLocked, false, 'isPermLocked should be false')
      assert.equal(dbUser.isTempLocked, false, 'isTempLocked should be false')
    })
  })

  describe('User Enable/Disable', () => {
    let toggleUser

    before(async () => {
      const [authorRole] = await roles.find({ shortName: 'contentcreator' })
      toggleUser = await authLocal.register({
        email: 'toggle@example.com',
        firstName: 'Toggle',
        lastName: 'User',
        password: testPassword,
        roles: [authorRole._id.toString()]
      })
    })

    it('should disable a user and set lock fields', async () => {
      const [user] = await users.find({ _id: toggleUser._id })
      await authLocal.setUserEnabled(user, false)
      const [dbUser] = await mongodb.find('users', { _id: toggleUser._id })
      assert.equal(dbUser.isEnabled, false, 'user should be disabled')
      assert.equal(dbUser.isPermLocked, true, 'isPermLocked should be true when disabled')
      assert.equal(dbUser.isTempLocked, true, 'isTempLocked should be true when disabled')
    })

    it('should re-enable a user and clear all lock fields', async () => {
      const [user] = await users.find({ _id: toggleUser._id })
      await authLocal.setUserEnabled(user, true)
      const [dbUser] = await mongodb.find('users', { _id: toggleUser._id })
      assert.equal(dbUser.isEnabled, true, 'user should be re-enabled')
      assert.equal(dbUser.failedLoginAttempts, 0, 'failedLoginAttempts should be reset to 0')
      assert.equal(dbUser.isPermLocked, false, 'isPermLocked should be false after re-enable')
      assert.equal(dbUser.isTempLocked, false, 'isTempLocked should be false after re-enable')
    })
  })
})
