import { App } from 'adapt-authoring-core'

let app

/**
 * Boots the Adapt authoring app and returns the App instance.
 * Caches the instance so subsequent calls return the same app.
 * @returns {Promise<App>}
 */
export async function getApp () {
  if (app) return app
  process.env.NODE_ENV = process.env.NODE_ENV || 'testing'
  app = await App.instance.onReady()
  return app
}

/**
 * Waits for a named module to be ready and returns it.
 * @param {string} name - Module name (e.g. 'adaptframework', 'content')
 * @returns {Promise<Object>}
 */
export async function getModule (name) {
  const a = await getApp()
  return a.waitForModule(name)
}

/**
 * Cleans up test data from the database.
 * Call this in after() hooks to leave the DB clean.
 * @param {string[]} collections - Collection names to clear
 */
export async function cleanDb (collections = ['content', 'assets', 'courseassets', 'tags', 'adaptbuilds']) {
  const mongodb = await getModule('mongodb')
  for (const name of collections) {
    try {
      await mongodb.getCollection(name).deleteMany({})
    } catch {
      // collection may not exist yet, that's fine
    }
  }
}
