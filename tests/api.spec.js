import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import { getApp, getModule } from '../lib/app.js'
import { getAllRoutes } from 'adapt-authoring-server'

let server
let routeMap

describe('API endpoint availability', () => {
  before(async () => {
    await getApp()
    server = await getModule('server')
    routeMap = getAllRoutes(server.api)
  })

  it('should have registered at least one API route', () => {
    assert.ok(routeMap.size > 0, 'route map should not be empty')
  })

  it('should respond to every registered route (not 404)', async () => {
    const url = server.url.startsWith('http') ? server.url : `http://${server.url}`
    const baseUrl = url.replace(/\/$/, '')
    const failures = []

    for (const [path, methods] of routeMap) {
      // Replace :param and {param} style placeholders with a dummy ObjectId
      const resolvedPath = path.replace(/[{]?:[^/}]+[}]?/g, '000000000000000000000000')

      for (const method of methods) {
        const url = `${baseUrl}${resolvedPath}`
        try {
          const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: ['POST', 'PUT', 'PATCH'].includes(method) ? '{}' : undefined
          })
          if (res.status === 404) {
            failures.push(`${method} ${path} => 404`)
          }
        } catch (err) {
          failures.push(`${method} ${path} => ${err.message}`)
        }
      }
    }
    assert.deepEqual(failures, [], `Routes returned 404:\n${failures.join('\n')}`)
  })
})
