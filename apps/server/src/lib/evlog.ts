import { env } from "@spice-world/server/lib/env";
import type { DrainContext } from "evlog";
import { initLogger } from "evlog";
import { createAxiomDrain } from "evlog/axiom";
import { createDrainPipeline } from "evlog/pipeline";

const deployed = env.NODE_ENV === "production" || env.NODE_ENV === "preview";

initLogger({
  enabled: env.NODE_ENV !== "test",
  env: { service: "spice-world-server", environment: env.NODE_ENV },
  pretty: !deployed,
  redact: { paths: ["body.shippingAddress"] }, // built-in masking stays on
  drain: deployed
    ? createDrainPipeline<DrainContext>()(
        createAxiomDrain({
          apiKey: env.AXIOM_TOKEN,
          dataset: "spice-world-logs",
        }),
      )
    : undefined,
});
