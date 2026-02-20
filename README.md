# Adapt Authoring Integration Tests

Integration test suite for the Adapt authoring tool. Tests the full application with a real database, covering import, build, and export workflows.

## Prerequisites

- Node.js 24+
- MongoDB 8.0+
- A running instance of the adapt-authoring app (dependencies installed)

## Setup

No fixtures are included by default. You must provide your own:

1. Copy `fixtures/manifest.example.json` to `fixtures/manifest.json`
2. Place your fixture files (e.g. a course export zip) in the `fixtures/` directory
3. Update `manifest.json` to list your fixtures

```bash
cp fixtures/manifest.example.json fixtures/manifest.json
cp /path/to/your-course-export.zip fixtures/course-export.zip
```

The manifest maps logical names to files:

```json
{
  "course-export": "course-export.zip"
}
```

Tests reference fixtures by name, so the same tests work with any content as long as the manifest has the expected keys.

## Running tests

From the **adapt-authoring app directory** (where `node_modules` and the full app are installed):

```bash
# Set required environment variables
export ADAPT_AUTHORING_AUTH__tokenSecret='testsecret'
export ADAPT_AUTHORING_MONGODB__connectionUri='mongodb://0.0.0.0/adapt-authoring-test'
export ADAPT_AUTHORING_SERVER__host='localhost'
export ADAPT_AUTHORING_SERVER__port='5678'
export ADAPT_AUTHORING_SERVER__url='http://localhost:5678'
export ADAPT_AUTHORING_SESSIONS__secret='testsessionssecret'

# Run all integration tests
node --test '../integration-tests/tests/**/*.spec.js'

# Run a specific test file
node --test ../integration-tests/tests/adaptframework-import.spec.js
```

## Custom fixtures (e.g. client testing)

Override the fixtures directory with the `FIXTURES_DIR` environment variable to test with different content:

```bash
# Create a directory with client fixtures
mkdir /path/to/client-fixtures
cp client-course.zip /path/to/client-fixtures/course-export.zip

# Create a manifest
echo '{ "course-export": "course-export.zip" }' > /path/to/client-fixtures/manifest.json

# Run tests with custom fixtures
FIXTURES_DIR=/path/to/client-fixtures node --test '../integration-tests/tests/**/*.spec.js'
```

This allows testing client-specific content on production servers without modifying the test repo.

## CI

The GitHub Actions workflow runs weekly and can be triggered manually via `workflow_dispatch`. It:

1. Checks out both this repo and the main adapt-authoring repo
2. Starts MongoDB via `supercharge/mongodb-github-action`
3. Installs app dependencies
4. Runs all integration tests

For CI, fixtures are downloaded from a separate test fixtures repository.
