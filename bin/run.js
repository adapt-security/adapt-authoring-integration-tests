#!/usr/bin/env node

/**
 * Integration test runner.
 *
 * Must be run from the adapt-authoring app directory (where node_modules are installed).
 *
 * Usage:
 *   npx at-integration-test                    # run all tests
 *   npx at-integration-test auth               # run auth.spec.js
 *   npx at-integration-test mongodb content    # run mongodb.spec.js and content.spec.js
 *   CUSTOM_DIR=/path/to/custom npx at-integration-test
 *
 * Environment variables:
 *   FIXTURES_DIR  - Override the default fixtures directory
 *   CUSTOM_DIR    - Path to a directory containing custom fixtures/ and tests/
 */

import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const testsDir = path.join(ROOT, 'tests')
const customDir = process.env.CUSTOM_DIR

// Resolve fixtures directory
if (!process.env.FIXTURES_DIR) {
  process.env.FIXTURES_DIR = path.join(ROOT, 'fixtures')
}

// Build list of test file paths
const testGlobs = []
const args = process.argv.slice(2)

if (args.length > 0) {
  for (const name of args) {
    const specFile = path.join(testsDir, `${name}.spec.js`)
    if (!fs.existsSync(specFile)) {
      console.error(`Test not found: ${name} (expected ${specFile})`)
      process.exit(1)
    }
    testGlobs.push(specFile)
  }
} else {
  testGlobs.push(`${testsDir}/*.spec.js`)
}

// Add custom tests if CUSTOM_DIR is set
if (customDir) {
  const customTestsDir = path.join(customDir, 'tests')
  const customFixturesDir = path.join(customDir, 'fixtures')

  if (fs.existsSync(customTestsDir)) {
    testGlobs.push(`${customTestsDir}/**/*.spec.js`)
    console.log(`Including custom tests from ${customTestsDir}`)
  }

  // Merge custom fixtures manifest into the main one if it exists
  if (fs.existsSync(path.join(customFixturesDir, 'manifest.json'))) {
    process.env.CUSTOM_FIXTURES_DIR = customFixturesDir
    console.log(`Including custom fixtures from ${customFixturesDir}`)
  }
}

const testArgs = testGlobs.map(g => `'${g}'`).join(' ')
const cmd = `node --test --test-force-exit --test-concurrency=1 ${testArgs}`

console.log(`Running: ${cmd}`)
console.log(`Fixtures: ${process.env.FIXTURES_DIR}`)
if (customDir) console.log(`Custom: ${customDir}`)
console.log()

try {
  execSync(cmd, { stdio: 'inherit', env: process.env })
} catch {
  process.exit(1)
}
