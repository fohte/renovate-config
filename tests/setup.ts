import nock from 'nock'
import { afterAll, afterEach, beforeAll } from 'vitest'

// Block all HTTP requests by default (like Ruby's webmock)
beforeAll(() => {
  nock.disableNetConnect()
})

afterEach(() => {
  // Clean up any pending mocks after each test
  nock.cleanAll()
})

afterAll(() => {
  // Restore HTTP connections after all tests
  nock.enableNetConnect()
})
