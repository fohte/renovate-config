import nock from 'nock'
import { afterAll, afterEach, beforeAll } from 'vitest'

// Block all HTTP requests by default (like Ruby's webmock)
// Allow localhost/127.0.0.1 for integration tests with local mock servers
beforeAll(() => {
  nock.disableNetConnect()
  nock.enableNetConnect(/^(localhost|127\.0\.0\.1)(:\d+)?$/)
})

afterEach(() => {
  // Clean up any pending mocks after each test
  nock.cleanAll()
})

afterAll(() => {
  // Restore HTTP connections after all tests
  nock.enableNetConnect()
})
