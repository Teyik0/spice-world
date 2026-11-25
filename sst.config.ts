// biome-ignore-all lint/correctness/noUnusedInstantiation: Pulumi constructors register resources through side effects.
/// <reference path="./.sst/platform/config.d.ts" />
// biome-ignore-all lint/correctness/noUndeclaredVariables: sst specific
// biome-ignore-all lint/suspicious/useAwait: sst specific
export default $config({
  app(input) {
    return {
      name: "spice-world",
      home: "cloudflare",
      removal: input?.stage === "production" ? "retain" : "remove",
      providers: {
        neon: { version: "0.13.0", apiKey: process.env.NEON_API_KEY },
        vercel: {
          version: "5.27.0",
          apiToken: process.env.VERCEL_API_TOKEN,
          team: "team_jKy3xXivkDGmI01SAr9Bo9d1",
        },
      },
    };
  },
  async run() {
    // PR stage (pr-<number>): a Neon branch forked from the seeded "preview" branch + a Vercel preview deployment of the PR branch.
    if ($app.stage.startsWith("pr-")) {
      const projectId = process.env.NEON_PROJECT_ID as string;
      const prBranch = new neon.Branch("spice-world-db-pr", {
        projectId,
        name: $app.stage,
        parentId: process.env.NEON_PREVIEW_BRANCH_ID as string,
      });
      const prEndpoint = new neon.Endpoint("spice-world-db-pr-endpoint", {
        projectId,
        branchId: prBranch.id,
        type: "read_write",
      });
      const databaseUrl = prEndpoint.host.apply((host) => {
        const url = new URL(process.env.PREVIEW_DATABASE_URL as string);
        url.host = host;
        return url.toString();
      });
      new sst.Linkable("PrDatabase", { properties: { url: databaseUrl } });
      const deployment = new vercel.Deployment("spice-world-server-pr", {
        projectId: process.env.VERCEL_SERVER_PROJECT_ID as string,
        ref: process.env.PR_BRANCH as string,
        production: false,
        environment: { DATABASE_URL: databaseUrl },
        deleteOnDestroy: true,
      });
      return { url: deployment.url };
    }
    const neonProject = new neon.Project("spice-world-db", {
      name: "spice-world-db",
      pgVersion: 18,
      regionId: "aws-eu-central-1",
      orgId: "org-crimson-shadow-55928194",
      historyRetentionSeconds: 21_600, // 6 hours (free tier limit)
    });
    const devBranch = new neon.Branch("spice-world-db-dev", {
      projectId: neonProject.id,
      name: "dev",
      parentId: neonProject.defaultBranchId,
    });
    const devEndpoint = new neon.Endpoint("spice-world-db-dev-endpoint", {
      projectId: neonProject.id,
      branchId: devBranch.id,
      type: "read_write",
    });
    // Seeded parent of every PR branch (see apps/server/scripts/seed.ts).
    const previewBranch = new neon.Branch("spice-world-db-preview", {
      projectId: neonProject.id,
      name: "preview",
      parentId: neonProject.defaultBranchId,
    });
    const previewEndpoint = new neon.Endpoint(
      "spice-world-db-preview-endpoint",
      {
        projectId: neonProject.id,
        branchId: previewBranch.id,
        type: "read_write",
      },
    );
    const connectionString = (host: $util.Input<string>) =>
      $interpolate`postgresql://${neonProject.databaseUser}:${neonProject.databasePassword}@${host}/${neonProject.databaseName}?sslmode=require`;
    const database = new sst.Linkable("Database", {
      properties: {
        prodConnectionString: neonProject.connectionUri,
        devConnectionString: connectionString(devEndpoint.host),
        previewConnectionString: connectionString(previewEndpoint.host),
      },
    });
    const serverSecrets = [
      "UPLOADTHING_TOKEN",
      "BETTER_AUTH_SECRET",
      "BETTER_AUTH_URL",
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "RESEND_API_KEY",
      "AXIOM_TOKEN",
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "STRIPE_PUBLISHABLE_KEY",
      "STRIPE_SUCCESS_URL",
      "STRIPE_CANCEL_URL",
      "WEB_ORIGINS",
    ].map((name) => new sst.Secret(name));
    const spiceWorldServer = new vercel.Project("spice-world-server", {
      name: "spice-world-server",
      framework: "container", // builds Dockerfile.vercel from the repo root
      resourceConfig: { functionDefaultRegions: ["fra1"] }, // same region as the Neon DB (Frankfurt)
      gitRepository: {
        type: "github",
        repo: "Teyik0/spice-world",
      },
    });
    new vercel.ProjectEnvironmentVariables("spice-world-server-env", {
      projectId: spiceWorldServer.id,
      variables: [
        ...serverSecrets.map((secret) => ({
          key: secret.name,
          value: secret.value,
          targets: ["production", "preview", "development"],
          sensitive: true,
        })),
        {
          key: "DATABASE_URL",
          value: database.properties.prodConnectionString,
          targets: ["production"],
          sensitive: true,
        },
        {
          key: "DATABASE_URL",
          value: database.properties.devConnectionString,
          targets: ["development"],
          sensitive: true,
        },
        {
          key: "DATABASE_URL",
          value: database.properties.previewConnectionString,
          targets: ["preview"],
          sensitive: true,
        },
      ],
    });
    // Auto-start dev servers
    new sst.x.DevCommand("Server", {
      dev: {
        autostart: true,
        command: "sst shell bun run dev",
        directory: "apps/server",
        title: "Elysia Server",
      },
    });
    new sst.x.DevCommand("Dashboard", {
      dev: {
        autostart: true,
        command: "sst shell bun run dev",
        directory: "apps/web",
        title: "Next.js Web",
      },
    });
    // Values to copy into GitHub (vars/secrets) for the preview workflow.
    return {
      NEON_PROJECT_ID: neonProject.id,
      NEON_PREVIEW_BRANCH_ID: previewBranch.id,
      VERCEL_SERVER_PROJECT_ID: spiceWorldServer.id,
      PREVIEW_DATABASE_URL: $util.secret(
        database.properties.previewConnectionString,
      ),
    };
  },
});
