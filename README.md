# Adapt Authoring Integration Tests

Integration test suite for the Adapt authoring tool. Tests the full application with a real database, covering import, build, and export workflows.

## Prerequisites

- Node.js 24+
- MongoDB 8.0+
- The adapt-authoring app with dependencies installed

## Setup

Create a fixtures directory with a `manifest.json` and your test fixture files:

```bash
mkdir /path/to/fixtures
echo '{ "course-export": "course-export.zip" }' > /path/to/fixtures/manifest.json
cp /path/to/your-course-export.zip /path/to/fixtures/course-export.zip
```

See `fixtures/manifest.example.json` for the expected format.

## Running tests

From the **adapt-authoring app directory**:

```bash
# Set required environment variables
export ADAPT_AUTHORING_AUTH__tokenSecret='testsecret'
export ADAPT_AUTHORING_MONGODB__connectionUri='mongodb://0.0.0.0/adapt-authoring-test'
export ADAPT_AUTHORING_SERVER__host='localhost'
export ADAPT_AUTHORING_SERVER__port='5678'
export ADAPT_AUTHORING_SERVER__url='http://localhost:5678'
export ADAPT_AUTHORING_SESSIONS__secret='testsessionssecret'

# Run all integration tests
FIXTURES_DIR=/path/to/fixtures npx at-integration-test

# Run only import tests
FIXTURES_DIR=/path/to/fixtures npx at-integration-test --import-only

# Run only build tests
FIXTURES_DIR=/path/to/fixtures npx at-integration-test --build-only
```

## Custom tests (e.g. client testing)

Point `CUSTOM_DIR` to a directory containing custom `fixtures/` and `tests/`:

```
my-client-tests/
  fixtures/
    manifest.json
    client-course.zip
  tests/
    client-specific.spec.js
```

```bash
CUSTOM_DIR=/path/to/my-client-tests npx at-integration-test
```

Custom fixtures are merged with the standard fixtures (custom takes priority on key collisions). Custom tests are run alongside the standard tests.

## CI

The GitHub Actions workflow runs weekly and can be triggered manually via `workflow_dispatch`. It:

1. Checks out both this repo and the main adapt-authoring repo
2. Downloads test fixtures from a separate repository
3. Starts MongoDB via `supercharge/mongodb-github-action`
4. Installs app dependencies
5. Runs all integration tests
