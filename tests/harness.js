// tests/harness.js — tiny framework-free test runner.
// Zero dependencies. Pure ES module. Loads via tests/index.html.

const results = []

function describe(name, fn) {
  console.group?.(name)
  try {
    fn()
  } finally {
    console.groupEnd?.(name)
  }
}

function it(name, fn) {
  try {
    fn()
    results.push({ name, pass: true })
  } catch (error) {
    results.push({ name, pass: false, error: error.message })
  }
}

function assertEqual(actual, expected, message) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) {
    throw new Error(
      `${message || 'assertion failed'} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    )
  }
}

// Alias for the rule-doc API surface.
const assert = assertEqual

function expect(actual) {
  return {
    toBe: (expected) => assertEqual(actual, expected),
    toEqual: (expected) => assertEqual(actual, expected),
    toBeTruthy: () => {
      if (!actual) throw new Error(`expected truthy, got ${actual}`)
    },
    toBeLessThan: (n) => {
      if (!(actual < n)) throw new Error(`expected ${actual} < ${n}`)
    },
  }
}

function render() {
  const root = document.getElementById('results')
  if (!root) return

  const total = results.length
  const passed = results.filter((r) => r.pass).length
  const failed = total - passed
  const allGreen = failed === 0

  const lines = results.map((r) => {
    const status = r.pass ? 'PASS' : 'FAIL'
    const detail = r.pass ? '' : ` — ${r.error || ''}`
    return `<li class="test ${r.pass ? 'pass' : 'fail'}"><span class="status">${status}</span> ${escapeHtml(r.name + detail)}</li>`
  })

  root.innerHTML = `
    <section class="summary ${allGreen ? 'green' : 'red'}">
      <h1>${passed} passed, ${failed} failed</h1>
      <p class="total">${total} total</p>
    </section>
    <ul class="tests">
      ${lines.join('')}
    </ul>
  `
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// Called by index.html after all test modules have loaded.
window.__runTests = render

export { describe, it, expect, assert, assertEqual, results }
