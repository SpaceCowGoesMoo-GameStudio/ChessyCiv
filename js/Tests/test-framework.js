// ============================================
// MINIMAL TEST FRAMEWORK
// ============================================
// Zero-dependency describe/it/assert framework for Node.js

const _suites = [];
let _currentSuite = null;
let _results = [];

function describe(name, fn) {
    const parent = _currentSuite;
    const suite = {
        name: parent ? `${parent.name} > ${name}` : name,
        tests: [],
        beforeEachFns: [],
        afterEachFns: []
    };
    _currentSuite = suite;
    _suites.push(suite);
    fn();
    _currentSuite = parent;
}

function it(name, fn) {
    if (!_currentSuite) throw new Error('it() must be inside describe()');
    _currentSuite.tests.push({ name, fn });
}

function beforeEach(fn) {
    if (!_currentSuite) throw new Error('beforeEach() must be inside describe()');
    _currentSuite.beforeEachFns.push(fn);
}

function afterEach(fn) {
    if (!_currentSuite) throw new Error('afterEach() must be inside describe()');
    _currentSuite.afterEachFns.push(fn);
}

const assert = {
    equal(actual, expected, msg) {
        if (actual !== expected) {
            throw new Error(msg || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
        }
    },
    notEqual(actual, expected, msg) {
        if (actual === expected) {
            throw new Error(msg || `Expected value to not equal ${JSON.stringify(expected)}`);
        }
    },
    ok(val, msg) {
        if (!val) {
            throw new Error(msg || `Expected truthy, got ${JSON.stringify(val)}`);
        }
    },
    deepEqual(actual, expected, msg) {
        const a = JSON.stringify(actual);
        const b = JSON.stringify(expected);
        if (a !== b) {
            throw new Error(msg || `Deep equal failed:\n  actual:   ${a}\n  expected: ${b}`);
        }
    },
    throws(fn, msg) {
        let threw = false;
        try { fn(); } catch (e) { threw = true; }
        if (!threw) {
            throw new Error(msg || 'Expected function to throw');
        }
    },
    includes(arr, item, msg) {
        if (!Array.isArray(arr)) {
            throw new Error(msg || `Expected array, got ${typeof arr}`);
        }
        const found = arr.some(el => {
            if (typeof el === 'object' && typeof item === 'object') {
                return JSON.stringify(el) === JSON.stringify(item);
            }
            return el === item;
        });
        if (!found) {
            throw new Error(msg || `Array does not include ${JSON.stringify(item)}`);
        }
    },
    closeTo(actual, expected, tol, msg) {
        if (Math.abs(actual - expected) > tol) {
            throw new Error(msg || `Expected ${actual} to be within ${tol} of ${expected}`);
        }
    },
    greaterThan(actual, expected, msg) {
        if (actual <= expected) {
            throw new Error(msg || `Expected ${actual} > ${expected}`);
        }
    },
    lessThan(actual, expected, msg) {
        if (actual >= expected) {
            throw new Error(msg || `Expected ${actual} < ${expected}`);
        }
    }
};

function runAllTests(filter, verbose) {
    _results = [];
    let passed = 0;
    let failed = 0;

    for (const suite of _suites) {
        if (filter && !suite.name.toLowerCase().includes(filter.toLowerCase())) {
            continue;
        }

        if (verbose) {
            console.log(`\n  ${suite.name}`);
        }

        for (const test of suite.tests) {
            const start = Date.now();
            try {
                for (const fn of suite.beforeEachFns) fn();
                test.fn();
                for (const fn of suite.afterEachFns) fn();
                const duration = Date.now() - start;
                _results.push({ suite: suite.name, name: test.name, passed: true, duration });
                passed++;
                if (verbose) {
                    console.log(`    \x1b[32m✓\x1b[0m ${test.name} (${duration}ms)`);
                }
            } catch (err) {
                const duration = Date.now() - start;
                _results.push({ suite: suite.name, name: test.name, passed: false, error: err, duration });
                failed++;
                if (verbose) {
                    console.log(`    \x1b[31m✗\x1b[0m ${test.name} (${duration}ms)`);
                }
            }
        }
    }

    return { passed, failed, results: _results };
}

function reportResults({ passed, failed, results }) {
    console.log('\n' + '='.repeat(60));

    if (failed > 0) {
        console.log('\n\x1b[31mFAILURES:\x1b[0m\n');
        for (const r of results) {
            if (!r.passed) {
                console.log(`  \x1b[31m✗\x1b[0m ${r.suite} > ${r.name}`);
                console.log(`    ${r.error.message}`);
                if (r.error.stack) {
                    const lines = r.error.stack.split('\n').slice(1, 4);
                    for (const line of lines) {
                        console.log(`    ${line.trim()}`);
                    }
                }
                console.log('');
            }
        }
    }

    const total = passed + failed;
    const color = failed > 0 ? '\x1b[31m' : '\x1b[32m';
    console.log(`${color}${passed} passed, ${failed} failed\x1b[0m (${total} total)`);
    console.log('='.repeat(60));

    return failed === 0 ? 0 : 1;
}

// Export to global
globalThis.describe = describe;
globalThis.it = it;
globalThis.beforeEach = beforeEach;
globalThis.afterEach = afterEach;
globalThis.assert = assert;
globalThis.runAllTests = runAllTests;
globalThis.reportResults = reportResults;
