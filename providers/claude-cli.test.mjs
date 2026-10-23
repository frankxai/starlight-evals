import test from 'node:test';
import assert from 'node:assert/strict';
import { extractFailureReason, parseClaudeStdout } from './claude-cli.mjs';

test('extractFailureReason', async (t) => {
  await t.test('should return .result from JSON if type === "result"', () => {
    const stdout = JSON.stringify([{ type: "result", result: "Failed to load model" }]);
    assert.equal(extractFailureReason(stdout, ""), "Failed to load model");
  });

  await t.test('should return .subtype if .result is missing', () => {
    const stdout = JSON.stringify({ type: "result", subtype: "Timeout error" });
    assert.equal(extractFailureReason(stdout, ""), "Timeout error");
  });

  await t.test('should append api_error_status if present', () => {
    const stdout = JSON.stringify({ type: "result", result: "API Error", api_error_status: "429" });
    assert.equal(extractFailureReason(stdout, ""), "API Error (api_error_status=429)");
  });

  await t.test('should find the result event even if it is the last in an array', () => {
    const stdout = JSON.stringify([
      { type: "init" },
      { type: "api_retry" },
      { type: "result", result: "Server error" }
    ]);
    assert.equal(extractFailureReason(stdout, ""), "Server error");
  });

  await t.test('should fallback to raw text from stderr/stdout if JSON parsing fails', () => {
    const stdout = "Some invalid JSON string";
    const stderr = "Error occurred";
    assert.equal(extractFailureReason(stdout, stderr), "(no result event; tail of raw output) Error occurred");
    assert.equal(extractFailureReason(stdout, ""), "(no result event; tail of raw output) Some invalid JSON string");
  });

  await t.test('should return "(no output)" if both stdout and stderr are empty', () => {
    assert.equal(extractFailureReason("", ""), "(no output)");
  });
});

test('parseClaudeStdout', async (t) => {
  await t.test('should parse a successful result properly', () => {
    const stdout = JSON.stringify({
      type: "result",
      result: "Here is the response.",
      usage: { input_tokens: 10, output_tokens: 20 },
      total_cost_usd: 0.05,
      session_id: "session_123",
      duration_ms: 100,
      num_turns: 2
    });

    const parsed = parseClaudeStdout(stdout);
    assert.deepEqual(parsed, {
      output: "Here is the response.",
      tokenUsage: { prompt: 10, completion: 20, total: 30 },
      cost: 0.05,
      metadata: { sessionId: "session_123", durationMs: 100, numTurns: 2 }
    });
  });

  await t.test('should parse an array of events and find the result event', () => {
    const stdout = JSON.stringify([
      { type: "init" },
      {
        type: "result",
        result: "Response text",
        usage: { input_tokens: 5, output_tokens: 10 },
        total_cost_usd: 0.01,
        session_id: "s1",
        duration_ms: 50,
        num_turns: 1
      }
    ]);

    const parsed = parseClaudeStdout(stdout);
    assert.deepEqual(parsed, {
      output: "Response text",
      tokenUsage: { prompt: 5, completion: 10, total: 15 },
      cost: 0.01,
      metadata: { sessionId: "s1", durationMs: 50, numTurns: 1 }
    });
  });

  await t.test('should return an error object if stdout is not valid JSON', () => {
    const stdout = "invalid json";
    const parsed = parseClaudeStdout(stdout);
    assert.ok(parsed.error);
    assert.ok(parsed.error.startsWith("claude-cli: non-JSON stdout"));
  });

  await t.test('should return an error if no result event is found', () => {
    const stdout = JSON.stringify([{ type: "init" }]);
    const parsed = parseClaudeStdout(stdout);
    assert.ok(parsed.error);
    assert.ok(parsed.error.startsWith("claude-cli: no result event in output"));
  });

  await t.test('should return an error if is_error is true', () => {
    const stdout = JSON.stringify({ type: "result", is_error: true, result: "Rate limit exceeded" });
    const parsed = parseClaudeStdout(stdout);
    assert.deepEqual(parsed, { error: "claude-cli: Rate limit exceeded" });
  });

  await t.test('should return an error if result.result is not a string', () => {
    const stdout = JSON.stringify({ type: "result", result: { complex: "object" } });
    const parsed = parseClaudeStdout(stdout);
    assert.ok(parsed.error);
    assert.ok(parsed.error.startsWith("claude-cli: result event missing string \"result\" field"));
  });
});
