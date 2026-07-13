const test = require("node:test");
const assert = require("node:assert/strict");
const { nextPlugState } = require("../src/policy");

test("charge limits", () => {
  assert.equal(nextPlugState(95, true, 15, 95), false);
  assert.equal(nextPlugState(100, true, 15, 95), false);
  assert.equal(nextPlugState(15, false, 15, 95), true);
  assert.equal(nextPlugState(10, false, 15, 95), true);
});

test("hysteresis keeps current state between the limits", () => {
  assert.equal(nextPlugState(50, true, 15, 95), true);
  assert.equal(nextPlugState(50, false, 15, 95), false);
  assert.equal(nextPlugState(16, true, 15, 95), true);
  assert.equal(nextPlugState(94, true, 15, 95), true);
  assert.equal(nextPlugState(94, false, 15, 95), false);
});
