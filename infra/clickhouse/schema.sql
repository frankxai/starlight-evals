-- Built on SIP — Brand Lab analytics schema (ClickHouse).
-- The committed receipt is the record; these tables are a queryable view over
-- every run so trends across model generations are one query, not a spreadsheet.
-- Load: clickhouse-client --multiquery < infra/clickhouse/schema.sql
-- Runner writes lab.calls + lab.pairwise when CLICKHOUSE_URL is set.

CREATE DATABASE IF NOT EXISTS lab;

-- One row per generation (contestant x task x sample).
CREATE TABLE IF NOT EXISTS lab.calls
(
  run_id        String,
  prereg_sha    FixedString(64),
  brand         LowCardinality(String),
  task_id       LowCardinality(String),
  tier          LowCardinality(String),
  workflow      LowCardinality(String),
  model         LowCardinality(String),
  family        LowCardinality(String),
  sample        UInt8,
  ok            UInt8,
  mech_pass     UInt8,
  input_tokens  Nullable(UInt32),
  output_tokens Nullable(UInt32),
  cost_usd      Nullable(Float64),   -- NULL = unmeasured, never 0
  latency_ms    Nullable(UInt32),
  served_by     LowCardinality(String),
  started_at    DateTime
)
ENGINE = ReplacingMergeTree
ORDER BY (brand, model, task_id, run_id, sample);

-- One row per candidate x comparator per run (the verdict layer).
CREATE TABLE IF NOT EXISTS lab.pairwise
(
  run_id      String,
  prereg_sha  FixedString(64),
  brand       LowCardinality(String),
  run_date    Date,
  candidate   LowCardinality(String),
  comparator  LowCardinality(String),
  tasks       UInt16,
  win_rate    Nullable(Float64),
  win_lo      Nullable(Float64),
  win_hi      Nullable(Float64),
  cost_ratio  Nullable(Float64),
  verdict     LowCardinality(String)
)
ENGINE = ReplacingMergeTree
ORDER BY (brand, candidate, comparator, run_date, run_id);

-- Mechanical pass rate + cost per model per brand per month: the longitudinal
-- "is the new generation actually better at OUR work" chart.
CREATE VIEW IF NOT EXISTS lab.model_month AS
SELECT
  toStartOfMonth(started_at) AS month,
  brand,
  model,
  count()                          AS calls,
  avg(mech_pass)                   AS mech_pass_rate,
  sumIf(cost_usd, cost_usd IS NOT NULL) AS cost_usd,
  countIf(cost_usd IS NULL)        AS cost_unmeasured_calls,
  quantile(0.5)(latency_ms)        AS p50_ms,
  quantile(0.95)(latency_ms)       AS p95_ms
FROM lab.calls
GROUP BY month, brand, model;

-- Cost per passing output: what a brand actually pays for a usable result.
CREATE VIEW IF NOT EXISTS lab.cost_per_pass AS
SELECT
  brand,
  model,
  tier,
  sumIf(cost_usd, cost_usd IS NOT NULL) / nullIf(sum(mech_pass), 0) AS usd_per_passing_output,
  sum(mech_pass) AS passing_outputs
FROM lab.calls
GROUP BY brand, model, tier;

-- Latest verdict per brand x candidate x comparator.
CREATE VIEW IF NOT EXISTS lab.latest_verdicts AS
SELECT brand, candidate, comparator,
       argMax(verdict, run_date)  AS verdict,
       argMax(win_rate, run_date) AS win_rate,
       argMax(win_lo, run_date)   AS win_lo,
       argMax(win_hi, run_date)   AS win_hi,
       argMax(cost_ratio, run_date) AS cost_ratio,
       max(run_date)              AS as_of
FROM lab.pairwise
GROUP BY brand, candidate, comparator;
