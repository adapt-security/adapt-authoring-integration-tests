import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { getApp, getModule, cleanDb } from '../lib/app.js'

let contentplugin
let content
let framework
let authLocal
let createdBy

describe('ContentPlugin module', () => {
  before(async () => {
    await getApp()
    contentplugin = await getModule('contentplugin')
    content = await getModule('content')
    framework = await getModule('adaptframework')
    authLocal = await getModule('auth-local')
    const user = await authLocal.register({
      email: 'contentplugin-test@example.com',
      firstName: 'Plugin',
      lastName: 'Tester',
      password: 'Password123!'
    })
    createdBy = user._id.toString()
  })

  after(async () => {
    await cleanDb(['content', 'users', 'authtokens'])
  })

  // ---------------------------------------------------------------------------
  // Plugin data in the database
  // ---------------------------------------------------------------------------
  describe('Plugin data', () => {
    it('should have synced plugins to the database', async () => {
      const plugins = await contentplugin.find()
      assert.ok(plugins.length > 0, 'should have at least one plugin in the database')
    })

    it('should have name, version, and type on each plugin', async () => {
      const plugins = await contentplugin.find()
      for (const p of plugins) {
        assert.ok(p.name, 'plugin should have a name')
        assert.ok(p.version, `${p.name} should have a version`)
        assert.ok(p.type, `${p.name} should have a type`)
      }
    })
  })

  // ---------------------------------------------------------------------------
  // find() with includeUpdateInfo
  // ---------------------------------------------------------------------------
  describe('find() with includeUpdateInfo', () => {
    it('should include update info when requested', async () => {
      const plugins = await contentplugin.find({ includeUpdateInfo: true })
      assert.ok(plugins.length > 0, 'should return plugins')
      for (const p of plugins) {
        assert.equal(typeof p.canBeUpdated, 'boolean', `${p.name} should have canBeUpdated`)
      }
    })

    it('should not include update info by default', async () => {
      const plugins = await contentplugin.find()
      assert.ok(plugins.length > 0, 'should return plugins')
      assert.equal(plugins[0].canBeUpdated, undefined, 'should not have canBeUpdated')
    })
  })

  // ---------------------------------------------------------------------------
  // insertOrUpdate()
  // ---------------------------------------------------------------------------
  describe('insertOrUpdate()', () => {
    const testPluginName = '__integration-test-plugin'

    after(async () => {
      const mongodb = await getModule('mongodb')
      await mongodb.getCollection(contentplugin.collectionName).deleteMany({ name: testPluginName })
    })

    it('should insert when the plugin does not exist', async () => {
      const result = await contentplugin.insertOrUpdate({
        name: testPluginName,
        displayName: 'Test Plugin',
        version: '1.0.0',
        type: 'extension',
        targetAttribute: '_test'
      })
      assert.ok(result._id, 'should return a document with _id')
      assert.equal(result.name, testPluginName)
      assert.equal(result.version, '1.0.0')
    })

    it('should update when the plugin already exists', async () => {
      const result = await contentplugin.insertOrUpdate({
        name: testPluginName,
        displayName: 'Test Plugin Updated',
        version: '2.0.0',
        type: 'extension',
        targetAttribute: '_test'
      })
      assert.equal(result.version, '2.0.0')

      const [found] = await contentplugin.find({ name: testPluginName })
      assert.equal(found.version, '2.0.0', 'database should reflect the update')
    })
  })

  // ---------------------------------------------------------------------------
  // isPluginSchema() and getPluginSchemas()
  // ---------------------------------------------------------------------------
  describe('Plugin schema tracking', () => {
    it('should have populated pluginSchemas during init', () => {
      assert.equal(typeof contentplugin.pluginSchemas, 'object')
      const pluginNames = Object.keys(contentplugin.pluginSchemas)
      assert.ok(pluginNames.length > 0, 'should have schema entries for installed plugins')
    })

    it('should return true for a known plugin schema via isPluginSchema()', () => {
      const firstPlugin = Object.keys(contentplugin.pluginSchemas)[0]
      const firstSchema = contentplugin.pluginSchemas[firstPlugin][0]
      assert.equal(contentplugin.isPluginSchema(firstSchema), true)
    })

    it('should return undefined for an unknown schema name', () => {
      assert.equal(contentplugin.isPluginSchema('__nonexistent_schema'), undefined)
    })

    it('should return the schema list via getPluginSchemas()', () => {
      const firstPlugin = Object.keys(contentplugin.pluginSchemas)[0]
      const schemas = contentplugin.getPluginSchemas(firstPlugin)
      assert.ok(Array.isArray(schemas), 'should return an array')
      assert.ok(schemas.length > 0, 'should have at least one schema')
    })

    it('should return an empty array for an unknown plugin', () => {
      assert.deepEqual(contentplugin.getPluginSchemas('__nonexistent'), [])
    })
  })

  // ---------------------------------------------------------------------------
  // getPluginUses()
  // ---------------------------------------------------------------------------
  describe('getPluginUses()', () => {
    let pluginId

    before(async () => {
      const plugins = await contentplugin.find()
      const testPlugin = plugins[0]
      pluginId = testPlugin._id.toString()

      // Create a course with the plugin enabled
      const v = false
      const course = await content.insert(
        { _type: 'course', title: 'Uses Test Course', createdBy },
        { validate: v, schemaName: 'course' }
      )
      await content.insert(
        {
          _type: 'config',
          _courseId: course._id.toString(),
          createdBy,
          _enabledPlugins: [testPlugin.name],
          _menu: '',
          _theme: ''
        },
        { validate: v, schemaName: 'config' }
      )
    })

    it('should return courses using the plugin', async () => {
      const uses = await contentplugin.getPluginUses(pluginId)
      assert.ok(Array.isArray(uses), 'should return an array')
      assert.ok(uses.length > 0, 'should find at least one course')
      assert.equal(uses[0].title, 'Uses Test Course')
    })

    it('should return an empty array for a plugin not in use', async () => {
      // Insert a dummy plugin that no course uses
      const dummy = await contentplugin.insertOrUpdate({
        name: '__unused-test-plugin',
        displayName: 'Unused',
        version: '1.0.0',
        type: 'extension',
        targetAttribute: '_unused'
      })
      const uses = await contentplugin.getPluginUses(dummy._id.toString())
      assert.deepEqual(uses, [])

      // Clean up
      const mongodb = await getModule('mongodb')
      await mongodb.getCollection(contentplugin.collectionName).deleteMany({ name: '__unused-test-plugin' })
    })
  })

  // ---------------------------------------------------------------------------
  // delete() — schema deregistration (the bug fix)
  // ---------------------------------------------------------------------------
  describe('delete()', () => {
    let targetPlugin
    let pluginSchemasBefore

    before(async () => {
      // Find a non-essential plugin with schemas that we can safely delete and reinstall
      const plugins = await contentplugin.find()
      for (const p of plugins) {
        const schemas = contentplugin.getPluginSchemas(p.name)
        if (schemas.length > 0 && !p.isLocalInstall) {
          targetPlugin = p
          break
        }
      }
      assert.ok(targetPlugin, 'should find a plugin with schemas to test deletion')
      pluginSchemasBefore = [...contentplugin.getPluginSchemas(targetPlugin.name)]
    })

    after(async () => {
      // Reinstall the plugin to restore state
      if (targetPlugin) {
        await framework.runCliCommand('installPlugins', {
          plugins: [`${targetPlugin.name}@${targetPlugin.version}`]
        })
        await contentplugin.insertOrUpdate({
          name: targetPlugin.name,
          displayName: targetPlugin.displayName,
          version: targetPlugin.version,
          type: targetPlugin.type,
          targetAttribute: targetPlugin.targetAttribute
        })
        // Re-process schemas
        const [pluginInfo] = await framework.runCliCommand('getPluginUpdateInfos', {
          plugins: [targetPlugin.name]
        })
        if (pluginInfo) {
          await contentplugin.processPluginSchemas(pluginInfo)
        }
      }
    })

    it('should throw CONTENTPLUGIN_IN_USE when plugin is used in a course', async () => {
      // The plugin from getPluginUses tests above is still enabled in a course
      const plugins = await contentplugin.find()
      const usedPlugin = plugins[0]

      // Create a course that uses this plugin
      const v = false
      const course = await content.insert(
        { _type: 'course', title: 'Delete Block Course', createdBy },
        { validate: v, schemaName: 'course' }
      )
      await content.insert(
        {
          _type: 'config',
          _courseId: course._id.toString(),
          createdBy,
          _enabledPlugins: [usedPlugin.name],
          _menu: '',
          _theme: ''
        },
        { validate: v, schemaName: 'config' }
      )

      await assert.rejects(
        () => contentplugin.delete({ _id: usedPlugin._id }),
        (err) => {
          assert.ok(
            err.code === 'CONTENTPLUGIN_IN_USE' || err.id === 'CONTENTPLUGIN_IN_USE',
            `expected CONTENTPLUGIN_IN_USE, got: ${err.code || err.id || err.message}`
          )
          return true
        }
      )
    })

    it('should deregister schemas when a plugin is deleted', async () => {
      // Verify schemas are registered before deletion
      for (const schemaName of pluginSchemasBefore) {
        assert.ok(
          contentplugin.isPluginSchema(schemaName),
          `${schemaName} should be registered before delete`
        )
      }

      await contentplugin.delete({ _id: targetPlugin._id })

      // Verify schemas are deregistered
      for (const schemaName of pluginSchemasBefore) {
        assert.equal(
          contentplugin.isPluginSchema(schemaName),
          undefined,
          `${schemaName} should be deregistered after delete`
        )
      }
    })

    it('should clean up the pluginSchemas cache', () => {
      assert.equal(
        contentplugin.pluginSchemas[targetPlugin.name],
        undefined,
        'pluginSchemas entry should be removed'
      )
    })

    it('should have removed the plugin from the database', async () => {
      const found = await contentplugin.find({ name: targetPlugin.name })
      assert.equal(found.length, 0, 'plugin should no longer be in the database')
    })

    it('should not affect schemas from other plugins', () => {
      const remaining = Object.keys(contentplugin.pluginSchemas)
      assert.ok(remaining.length > 0, 'other plugins should still have schemas registered')
    })
  })
})
