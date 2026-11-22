import { beforeAll, describe, expect, test } from "bun:test";
import { $ } from "bun";

interface BombardierResult {
  result: {
    rps: {
      mean: number;
      stddev: number;
      max: number;
    };
    latency: {
      mean: number;
      stddev: number;
      max: number;
      percentiles: {
        "50": number;
        "75": number;
        "90": number;
        "95": number;
        "99": number;
      };
    };
    req1xx: number;
    req2xx: number;
    req3xx: number;
    req4xx: number;
    req5xx: number;
    others: number;
  };
  spec: {
    numberOfConnections: number;
    testDuration: string;
    method: string;
    url: string;
  };
}

interface LoadTestCase {
  connections?: number;
  duration?: string;
  method: string;
  minRps: number;
  path: string;
  query?: string[];
}

const JSON_OUTPUT = /\{.*\}/su;

async function runLoadTest(
  endpoint: string,
  connections = 100,
  duration = "10s"
): Promise<BombardierResult> {
  const url = `http://localhost:3001${endpoint}`;

  const output =
    await $`bombardier -c ${connections} -d ${duration} -l -o json ${url}`.text();

  // Extract JSON from output (bombardier outputs progress text before JSON)
  const jsonMatch = output.match(JSON_OUTPUT);
  if (!jsonMatch) {
    throw new Error(`No JSON found in bombardier output:\n${output}`);
  }

  return JSON.parse(jsonMatch[0]) as BombardierResult;
}

/** Merges parallel instances: RPS/counts summed, latency percentiles maxed (conservative). */
function aggregateResults(parts: BombardierResult[]): BombardierResult {
  const sum = (get: (r: BombardierResult) => number) =>
    parts.reduce((total, part) => total + get(part), 0);
  const max = (get: (r: BombardierResult) => number) =>
    Math.max(...parts.map(get));

  return {
    result: {
      rps: {
        mean: sum((r) => r.result.rps.mean),
        stddev: 0,
        max: max((r) => r.result.rps.max),
      },
      latency: {
        mean: max((r) => r.result.latency.mean),
        stddev: 0,
        max: max((r) => r.result.latency.max),
        percentiles: {
          "50": max((r) => r.result.latency.percentiles["50"]),
          "75": max((r) => r.result.latency.percentiles["75"]),
          "90": max((r) => r.result.latency.percentiles["90"]),
          "95": max((r) => r.result.latency.percentiles["95"]),
          "99": max((r) => r.result.latency.percentiles["99"]),
        },
      },
      req1xx: sum((r) => r.result.req1xx),
      req2xx: sum((r) => r.result.req2xx),
      req3xx: sum((r) => r.result.req3xx),
      req4xx: sum((r) => r.result.req4xx),
      req5xx: sum((r) => r.result.req5xx),
      others: sum((r) => r.result.others),
    },
    spec: parts[0].spec,
  };
}

async function runLoadTestSuite(tc: LoadTestCase): Promise<{
  stats: BombardierResult;
  connections: number;
  duration: string;
}> {
  const queries = tc.query ?? [""];
  const connections = tc.connections ?? 100;
  const duration = tc.duration ?? "10s";
  const perInstance = Math.floor(connections / queries.length);

  if (queries.length > 1) {
    // Warm each variant once: a cold /products miss runs the full variant
    // aggregation (~1s+ per query), which would saturate PG and time out.
    await Promise.all(
      queries.map((q) => fetch(`http://localhost:3001${tc.path}${q}`))
    );
  }

  const results = await Promise.all(
    queries.map((q) => runLoadTest(`${tc.path}${q}`, perInstance, duration))
  );

  return {
    stats: results.length === 1 ? results[0] : aggregateResults(results),
    connections,
    duration,
  };
}

function logLoadTestResults(
  endpoint: string,
  connections: number,
  duration: string,
  stats: BombardierResult
): void {
  console.log(`\n📊 ${endpoint} (${connections} connections, ${duration}):`);
  console.log(`   RPS: ${stats.result.rps.mean.toFixed(2)} req/s`);
  console.log(
    `   Latency p50: ${(stats.result.latency.percentiles["50"] / 1000).toFixed(2)}ms`
  );
  console.log(
    `   Latency p95: ${(stats.result.latency.percentiles["95"] / 1000).toFixed(2)}ms`
  );
  console.log(
    `   Latency p99: ${(stats.result.latency.percentiles["99"] / 1000).toFixed(2)}ms`
  );
  console.log(
    `   Successful: ${stats.result.req2xx} | Errors: ${stats.result.req4xx + stats.result.req5xx}`
  );
}

function expectHealthyLoad(
  endpoint: string,
  stats: BombardierResult,
  minRps: number
): void {
  expect(
    stats.result.req4xx + stats.result.req5xx + stats.result.others,
    `${endpoint}: 4xx/5xx/others should be 0 (req2xx > minRps proves counters parsed)`
  ).toBe(0);
  expect(
    stats.result.rps.mean,
    `${endpoint}: RPS ${stats.result.rps.mean.toFixed(0)} should exceed ${minRps}`
  ).toBeGreaterThan(minRps);
  expect(
    stats.result.latency.percentiles["99"] / 1000,
    `${endpoint}: p99 should stay under 500ms`
  ).toBeLessThan(500);
}

const SORTS = [
  "name",
  "createdAt",
  "updatedAt",
  "priceMin",
  "priceMax",
] as const;
const PAGE_SIZE = 25; // default take (product model)
const PRODUCT_COUNT = 100_000; // seeded database size

describe("Load Testing", () => {
  const endpoints: LoadTestCase[] = [
    { method: "GET", path: "/products", minRps: 3000 },
    {
      method: "GET",
      path: "/products",
      query: ["?sortBy=priceMin"],
      minRps: 1200,
    },
    { method: "GET", path: "/categories", minRps: 1200 },
    { method: "GET", path: "/attributes", minRps: 1200 },
    {
      method: "GET",
      path: "/products",
      // 5 sorts × random page (per run) → varied cache keys & orderBy branches
      query: SORTS.map((sortBy) => {
        const skip =
          Math.floor(Math.random() * (PRODUCT_COUNT / PAGE_SIZE)) * PAGE_SIZE;
        return `?skip=${skip}&sortBy=${sortBy}`;
      }),
      connections: 500,
      duration: "30s",
      minRps: 3000,
    },
  ];

  beforeAll(() => {
    if (Bun.env.NODE_ENV === "production") {
      throw new Error("You can't run tests in production");
    }
    if (!Bun.env.DATABASE_URL) {
      throw new Error("DATABASE_URL should be set");
    }
  });

  test.each(endpoints)(
    "$method $path - should handle high load",
    async (tc) => {
      const varied = tc.query?.length ?? 0;
      const label =
        varied > 1
          ? `${tc.method} ${tc.path} (${varied} varied queries)`
          : `${tc.method} ${tc.path}${tc.query?.[0] ?? ""}`;

      const { stats, connections, duration } = await runLoadTestSuite(tc);
      logLoadTestResults(label, connections, duration, stats);
      expectHealthyLoad(label, stats, tc.minRps);
    },
    3_000_000
  );
});
