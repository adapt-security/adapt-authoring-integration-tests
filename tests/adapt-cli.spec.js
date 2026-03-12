import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { getApp, getModule } from '../lib/app.js'

let framework

describe('adapt-cli', () => {
  before(async () => {
    await getApp()
    framework = await getModule('adaptframework')
  })

  // ---------------------------------------------------------------------------
  // getPluginUpdateInfos
  // ---------------------------------------------------------------------------
  describe('getPluginUpdateInfos()', () => {
    let plugins

    before(async () => {
      plugins = await framework.runCliCommand('getPluginUpdateInfos')
    })

    it('should return an array of plugins', () => {
      assert.ok(Array.isArray(plugins), 'should return an array')
      assert.ok(plugins.length > 0, 'should have at least one plugin')
    })

    it('should include name and version info on each plugin', () => {
      for (const p of plugins) {
        assert.ok(p.name, `plugin should have a name`)
        assert.ok(typeof p.matchedVersion === 'string', `${p.name} should have a matchedVersion`)
      }
    })

    it('should include update status flags', () => {
      for (const p of plugins) {
        assert.equal(typeof p.canBeUpdated, 'boolean', `${p.name} should have canBeUpdated`)
      }
    })

    it('should filter by plugin names when specified', async () => {
      const firstName = plugins[0].name
      const filtered = await framework.runCliCommand('getPluginUpdateInfos', { plugins: [firstName] })
      assert.equal(filtered.length, 1, 'should return only the requested plugin')
      assert.equal(filtered[0].name, firstName)
    })

    it('should expose getInfo() returning plugin metadata', async () => {
      const info = await plugins[0].getInfo()
      assert.ok(info, 'getInfo() should return an object')
      assert.ok(info.name || info.displayName, 'info should have a name or displayName')
    })

    it('should expose getType() returning a valid plugin type', async () => {
      const type = await plugins[0].getType()
      assert.ok(
        ['component', 'extension', 'menu', 'theme'].includes(type),
        `getType() should return a valid type, got: ${type}`
      )
    })

    it('should expose getSchemaPaths() returning an array', async () => {
      const paths = await plugins[0].getSchemaPaths()
      assert.ok(Array.isArray(paths), 'getSchemaPaths() should return an array')
    })
  })

  // ---------------------------------------------------------------------------
  // getInstalledPlugins (via framework helper)
  // ---------------------------------------------------------------------------
  describe('getInstalledPlugins()', () => {
    let installed

    before(async () => {
      installed = await framework.getInstalledPlugins()
    })

    it('should return an array of plugins', () => {
      assert.ok(Array.isArray(installed), 'should return an array')
      assert.ok(installed.length > 0, 'should have at least one installed plugin')
    })

    it('should include name on each plugin', () => {
      for (const p of installed) {
        assert.ok(p.name, 'installed plugin should have a name')
      }
    })
  })

  // ---------------------------------------------------------------------------
  // installPlugins / uninstallPlugins round-trip
  // ---------------------------------------------------------------------------
  describe('installPlugins() and uninstallPlugins()', () => {
    let installedBefore
    let targetPlugin

    before(async () => {
      const all = await framework.runCliCommand('getPluginUpdateInfos')
      installedBefore = all.map(p => p.name)
      // Pick a plugin that's already installed so we can uninstall and reinstall it
      targetPlugin = all.find(p => p.matchedVersion && !p.isLocalSource)
      assert.ok(targetPlugin, 'should have at least one non-local plugin to test with')
    })

    after(async () => {
      // Ensure the plugin is reinstalled if the test left it removed
      const current = await framework.runCliCommand('getPluginUpdateInfos')
      if (!current.find(p => p.name === targetPlugin.name)) {
        await framework.runCliCommand('installPlugins', {
          plugins: [`${targetPlugin.name}@${targetPlugin.matchedVersion}`]
        })
      }
    })

    it('should uninstall a plugin', async () => {
      const result = await framework.runCliCommand('uninstallPlugins', {
        plugins: [targetPlugin.name]
      })
      assert.ok(Array.isArray(result), 'should return an array')
    })

    it('should no longer list the uninstalled plugin', async () => {
      const installed = await framework.getInstalledPlugins()
      const found = installed.find(p => p.name === targetPlugin.name)
      assert.equal(found, undefined, 'uninstalled plugin should not appear in installed list')
    })

    it('should reinstall the plugin', async () => {
      const result = await framework.runCliCommand('installPlugins', {
        plugins: [`${targetPlugin.name}@${targetPlugin.matchedVersion}`]
      })
      assert.ok(Array.isArray(result), 'should return an array')
      assert.equal(result.length, 1, 'should have installed one plugin')
      assert.equal(result[0].name, targetPlugin.name)
    })

    it('should list the reinstalled plugin', async () => {
      const installed = await framework.getInstalledPlugins()
      const found = installed.find(p => p.name === targetPlugin.name)
      assert.ok(found, 'reinstalled plugin should appear in installed list')
    })
  })

  // ---------------------------------------------------------------------------
  // updatePlugins
  // ---------------------------------------------------------------------------
  describe('updatePlugins()', () => {
    it('should not throw when updating all plugins', async () => {
      const all = await framework.runCliCommand('getPluginUpdateInfos')
      const updatable = all.filter(p => p.canBeUpdated)
      if (!updatable.length) {
        // Nothing to update — just verify the command runs without error
        const result = await framework.runCliCommand('updatePlugins', { plugins: [] })
        assert.ok(Array.isArray(result), 'should return an array even with nothing to update')
        return
      }
      const result = await framework.runCliCommand('updatePlugins', {
        plugins: [updatable[0].name]
      })
      assert.ok(Array.isArray(result), 'should return an array')
    })
  })
})
