import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Subprocess } from "bun";
import { $ } from "bun";
import { createTestDatabase } from "../tests/utils/db-manager";
import { createDummyProducts } from "../tests/utils/dummy-products";

interface BombardierResult {
	spec: {
		numberOfConnections: number;
		testDuration: string;
		method: string;
		url: string;
	};
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
		throughput: {
			mean: number;
			stddev: number;
			max: number;
		};
	};
}

async function runLoadTest(
	endpoint: string,
	connections = 100,
	duration = "10s",
): Promise<BombardierResult> {
	const url = `http://localhost:3002${endpoint}`;

	const output =
		await $`bombardier -c ${connections} -d ${duration} -l -o json ${url}`.text();

	// Extract JSON from output (bombardier outputs progress text before JSON)
	const jsonMatch = output.match(/\{.*\}/s);
	if (!jsonMatch) {
		throw new Error(`No JSON found in bombardier output:\n${output}`);
	}

	return JSON.parse(jsonMatch[0]) as BombardierResult;
}

function logLoadTestResults(
	endpoint: string,
	connections: number,
	duration: string,
	stats: BombardierResult,
): void {
	console.log(`\n📊 ${endpoint} (${connections} connections, ${duration}):`);
	console.log(`   RPS: ${stats.result.rps.mean.toFixed(2)} req/s`);
	console.log(
		`   Latency p50: ${(stats.result.latency.percentiles["50"] / 1000).toFixed(2)}ms`,
	);
	console.log(
		`   Latency p95: ${(stats.result.latency.percentiles["95"] / 1000).toFixed(2)}ms`,
	);
	console.log(
		`   Latency p99: ${(stats.result.latency.percentiles["99"] / 1000).toFixed(2)}ms`,
	);
	console.log(
		`   Successful: ${stats.result.req2xx} | Errors: ${stats.result.req4xx + stats.result.req5xx}`,
	);
}

describe("Load Testing", () => {
	let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
	let serverProcess: Subprocess;

	beforeAll(async () => {
		if (Bun.env.NODE_ENV === "production") {
			throw new Error("You can't run tests in production");
		}
		if (!Bun.env.DATABASE_URL) {
			throw new Error("DATABASE_URL should be set");
		}

		testDb = await createTestDatabase("load.test.ts");

		await createDummyProducts(testDb.client);

		serverProcess = Bun.spawn(["bun", "run", "src/index.ts"], {
			env: {
				...process.env,
				PORT: "3002",
			},
			stdout: "ignore",
			stderr: "ignore",
		});

		await new Promise((resolve) => setTimeout(resolve, 3000));
	});

	afterAll(async () => {
		serverProcess.kill();
		await testDb.destroy();
	});

	test("GET /products - should handle high load", async () => {
		const stats = await runLoadTest("/products", 100, "10s");
		logLoadTestResults("GET /products", 100, "10s", stats);

		expect(stats.result.req2xx).toBe(0);
		expect(stats.result.req4xx).toBe(0);
		expect(stats.result.req5xx).toBe(0);
		expect(stats.result.rps.mean).toBeGreaterThan(50);
		expect(stats.result.latency.percentiles["95"]).toBeLessThan(2_000_000); // 2s in microseconds
	}, 30000);

	test("GET /products?sortBy=price - should handle sorted requests", async () => {
		const stats = await runLoadTest("/products?sortBy=price", 100, "10s");
		logLoadTestResults("GET /products?sortBy=price", 100, "10s", stats);

		expect(stats.result.req2xx).toBe(0);
		expect(stats.result.req4xx).toBe(0);
		expect(stats.result.req5xx).toBe(0);
		expect(stats.result.rps.mean).toBeGreaterThan(40);
		expect(stats.result.latency.percentiles["95"]).toBeLessThan(2_500_000); // 2.5s in microseconds
	}, 30000);

	test("GET /categories - should handle high load", async () => {
		const stats = await runLoadTest("/categories", 100, "10s");
		logLoadTestResults("GET /categories", 100, "10s", stats);

		expect(stats.result.req2xx).toBe(0);
		expect(stats.result.req4xx).toBe(0);
		expect(stats.result.req5xx).toBe(0);
		expect(stats.result.rps.mean).toBeGreaterThan(150);
		expect(stats.result.latency.percentiles["95"]).toBeLessThan(1_500_000); // 1.5s in microseconds
	}, 30000);

	test("GET /attributes - should handle high load", async () => {
		const stats = await runLoadTest("/attributes", 100, "10s");
		logLoadTestResults("GET /attributes", 100, "10s", stats);

		expect(stats.result.req2xx).toBeGreaterThan(0);
		expect(stats.result.req4xx).toBe(0);
		expect(stats.result.req5xx).toBe(0);
		expect(stats.result.rps.mean).toBeGreaterThan(150);
		expect(stats.result.latency.percentiles["95"]).toBeLessThan(1_500_000); // 1.5s in microseconds
	}, 30000);

	test("Stress test - 500 connections on /products", async () => {
		const stats = await runLoadTest("/products", 500, "30s");
		logLoadTestResults("GET /products (STRESS)", 500, "30s", stats);

		expect(stats.result.req2xx).toBeGreaterThan(0);
		expect(stats.result.req5xx).toBe(0);
		expect(stats.result.rps.mean).toBeGreaterThan(40);
		expect(stats.result.latency.percentiles["99"]).toBeLessThan(5_000_000); // 5s in microseconds
	}, 60000);
});
