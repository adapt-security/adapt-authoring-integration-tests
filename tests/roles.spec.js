import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { getApp, getModule } from '../lib/app.js'

let roles
let mongodb
const createdRoleIds = []

describe('Roles', () => {
  before(async () => {
    await getApp()
    roles = await getModule('roles')
    mongodb = await getModule('mongodb')
  })

  after(async () => {
    for (const id of createdRoleIds) {
      try {
        await roles.delete({ _id: id })
      } catch {
        // role may already have been removed, that's fine
      }
    }
  })

  // ── Default Roles ───────────────────────────────────────────────────

  describe('Default roles', () => {
    it('should have created the authuser role on boot', async () => {
      const [authuser] = await roles.find({ shortName: 'authuser' })
      assert.ok(authuser, 'authuser role should exist')
      assert.equal(authuser.shortName, 'authuser')
    })

    it('should have created the contentcreator role on boot', async () => {
      const [contentcreator] = await roles.find({ shortName: 'contentcreator' })
      assert.ok(contentcreator, 'contentcreator role should exist')
      assert.equal(contentcreator.displayName, 'Content creator')
    })

    it('should have created the superuser role on boot', async () => {
      const [superuser] = await roles.find({ shortName: 'superuser' })
      assert.ok(superuser, 'superuser role should exist')
      assert.deepEqual(superuser.scopes, ['*:*'])
    })
  })

  // ── Scope Inheritance ──────────────────────────────────────────────

  describe('Scope inheritance', () => {
    let roleA
    let roleB

    before(async () => {
      roleA = await roles.insert({
        shortName: 'testrole-a',
        displayName: 'Test Role A',
        scopes: ['read:foo']
      })
      createdRoleIds.push(roleA._id)

      roleB = await roles.insert({
        shortName: 'testrole-b',
        displayName: 'Test Role B',
        scopes: ['write:foo'],
        extends: 'testrole-a'
      })
      createdRoleIds.push(roleB._id)
    })

    it('should return own scopes for a role with no parent', async () => {
      const scopes = await roles.getScopesForRole(roleA._id)
      assert.deepEqual(scopes, ['read:foo'])
    })

    it('should return both own and inherited scopes for a child role', async () => {
      const scopes = await roles.getScopesForRole(roleB._id)
      assert.ok(scopes.includes('write:foo'), 'should include own scope write:foo')
      assert.ok(scopes.includes('read:foo'), 'should include inherited scope read:foo')
    })

    it('should return child scopes before parent scopes', async () => {
      const scopes = await roles.getScopesForRole(roleB._id)
      const writeIdx = scopes.indexOf('write:foo')
      const readIdx = scopes.indexOf('read:foo')
      assert.ok(writeIdx < readIdx, 'own scopes should come before inherited scopes')
    })

    it('should resolve the built-in contentcreator -> authuser chain', async () => {
      const [contentcreator] = await roles.find({ shortName: 'contentcreator' })
      const scopes = await roles.getScopesForRole(contentcreator._id)
      assert.ok(scopes.includes('read:content'), 'should include contentcreator scope')
      assert.ok(scopes.includes('read:me'), 'should include inherited authuser scope')
    })
  })

  // ── Super Role ─────────────────────────────────────────────────────

  describe('Super role', () => {
    it('should return the ID of the role with *:* scope', async () => {
      const superRoleId = await roles.getSuperRoleId()
      assert.ok(superRoleId, 'should return a truthy ID')
      const [superRole] = await roles.find({ _id: superRoleId })
      assert.ok(superRole, 'should be a valid role')
      assert.deepEqual(superRole.scopes, ['*:*'])
    })

    it('should match the superuser role by shortName', async () => {
      const superRoleId = await roles.getSuperRoleId()
      const [superuser] = await roles.find({ shortName: 'superuser' })
      assert.equal(superRoleId, superuser._id.toString())
    })
  })

  // ── Role CRUD ──────────────────────────────────────────────────────

  describe('Role CRUD', () => {
    let customRole

    it('should create a custom role', async () => {
      customRole = await roles.insert({
        shortName: 'testrole-crud',
        displayName: 'Test CRUD Role',
        scopes: ['read:test', 'write:test']
      })
      createdRoleIds.push(customRole._id)
      assert.ok(customRole._id, 'inserted role should have an _id')
      assert.equal(customRole.shortName, 'testrole-crud')
    })

    it('should find the custom role by shortName', async () => {
      const [found] = await roles.find({ shortName: 'testrole-crud' })
      assert.ok(found, 'should find the role')
      assert.equal(found._id.toString(), customRole._id.toString())
      assert.deepEqual(found.scopes, ['read:test', 'write:test'])
    })

    it('should find the custom role by _id', async () => {
      const [found] = await roles.find({ _id: customRole._id })
      assert.ok(found, 'should find the role by _id')
      assert.equal(found.shortName, 'testrole-crud')
    })
  })

  // ── Short Name Resolution ─────────────────────────────────────────

  describe('Short name resolution', () => {
    it('should resolve authuser shortName to its database ID', async () => {
      const [authuser] = await roles.find({ shortName: 'authuser' })
      const ids = await roles.shortNamesToIds(['authuser'])
      assert.equal(ids.length, 1)
      assert.equal(ids[0], authuser._id.toString())
    })

    it('should resolve multiple shortNames in a single call', async () => {
      const [authuser] = await roles.find({ shortName: 'authuser' })
      const [superuser] = await roles.find({ shortName: 'superuser' })
      const ids = await roles.shortNamesToIds(['authuser', 'superuser'])
      assert.equal(ids.length, 2)
      assert.equal(ids[0], authuser._id.toString())
      assert.equal(ids[1], superuser._id.toString())
    })
  })
})
