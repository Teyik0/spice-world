import cluster from "node:cluster";
import os from "node:os";
import process from "node:process";

if (cluster.isPrimary) {
	for (let i = 0; i < os.availableParallelism(); i++) {
		cluster.fork();
	}
} else {
	await import("@spice-world/server/src/index.ts");
	console.log(`Worker ${process.pid} started`);
}
