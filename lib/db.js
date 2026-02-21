import path from 'path'

/**
 * Drops the test database to ensure a clean state before the app boots.
 *
 * Stale records (e.g. contentplugins from a previous run) can cause
 * initPlugins to look for plugin files that no longer exist.
 *
 * @param {string} [cwd=process.cwd()] - Working directory to resolve config from
 * @returns {Promise<boolean>} true if the database was dropped, false otherwise
 */
export async function dropTestDb (cwd = process.cwd()) {
  try {
    const configPath = path.resolve(cwd, 'conf', `${process.env.NODE_ENV || 'testing'}.config.js`)
    const config = (await import(configPath)).default
    const uri = config['adapt-authoring-mongodb']?.connectionUri
    if (!uri) return false
    const { MongoClient } = await import('mongodb')
    const client = new MongoClient(uri)
    await client.connect()
    await client.db().dropDatabase()
    await client.close()
    return true
  } catch (e) {
    // not fatal – the DB may not exist yet on first run
    return false
  }
}
