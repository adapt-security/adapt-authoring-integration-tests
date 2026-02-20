#!/usr/bin/env node

/**
 * Integration test runner.
 *
 * Must be run from the adapt-authoring app directory (where node_modules are installed).
 *
 * Usage:
 *   node /path/to/integration-tests/bin/run.js
 *   node /path/to/integration-tests/bin/run.js --import-only
 *   node /path/to/integration-tests/bin/run.js --build-only
 *   CUSTOM_DIR=/path/to/custom node /path/to/integration-tests/bin/run.js
 *
 * Environment variables:
 *   FIXTURES_DIR  - Override the default fixtures directory
 *   CUSTOM_DIR    - Path to a directory containing custom fixtures/ and tests/
 */

import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const testsDir = path.join(ROOT, 'tests')
const customDir = process.env.CUSTOM_DIR

// Resolve fixtures directory
if (!process.env.FIXTURES_DIR) {
  process.env.FIXTURES_DIR = path.join(ROOT, 'fixtures')
}

// Build list of test file globs
const testGlobs = []

// Parse arguments
const args = process.argv.slice(2)
const importOnly = args.includes('--import-only')
const buildOnly = args.includes('--build-only')

if (importOnly) {
  testGlobs.push(path.join(testsDir, 'adaptframework-import.spec.js'))
} else if (buildOnly) {
  testGlobs.push(path.join(testsDir, 'adaptframework-build.spec.js'))
} else {
  testGlobs.push(`${testsDir}/**/*.spec.js`)
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
