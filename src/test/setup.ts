/**
 * Test setup.
 *
 * fake-indexeddb/auto installs a real, spec-compliant IndexedDB implementation
 * onto globalThis, so Dexie runs against genuine IndexedDB semantics — including
 * Blob storage — rather than against a mock of our own design. A mock would
 * happily "store" a Blob that a real browser would reject.
 */

import 'fake-indexeddb/auto';
