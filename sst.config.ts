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
    // PR stage (pr-<number>): Vercel preview deployments of the PR branch, on the anonymized Neon branch created by preview.yaml.
    if ($app.stage.startsWith("pr-")) {
      // Stable web URL, known before deploying: the server must trust it as an origin.
      const webDomain = `spice-world-web-${$app.stage}-teyik0-team.vercel.app`;
      const server = new vercel.Deployment("spice-world-server-pr", {
        projectId: process.env.VERCEL_SERVER_PROJECT_ID as string,
        ref: process.env.PR_SHA as string, // a new commit replaces the deployment
        production: false,
        environment: {
          DATABASE_URL: process.env.PR_DATABASE_URL as string,
          WEB_ORIGINS: `https://${webDomain}`,
          // Auth is served through the web /api proxy; Google only knows the production URL.
          BETTER_AUTH_URL: `https://${webDomain}`,
          BETTER_AUTH_PRODUCTION_URL: "https://spice-world-web.vercel.app",
        },
        deleteOnDestroy: true,
      });
      const web = new vercel.Deployment("spice-world-web-pr", {
        projectId: process.env.VERCEL_WEB_PROJECT_ID as string,
        ref: process.env.PR_SHA as string,
        production: false,
        projectSettings: { rootDirectory: "apps/dashboard" },
        environment: { API_URL: $interpolate`https://${server.url}` },
        deleteOnDestroy: true,
      });
      new vercel.Alias("spice-world-web-pr-alias", {
        alias: webDomain,
        deploymentId: web.id,
      });
      return { server: server.url, web: webDomain };
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
    const connectionString = (host: $util.Input<string>) =>
      $interpolate`postgresql://${neonProject.databaseUser}:${neonProject.databasePassword}@${host}/${neonProject.databaseName}?sslmode=require`;
    const database = new sst.Linkable("Database", {
      properties: {
        prodConnectionString: neonProject.connectionUri,
        devConnectionString: connectionString(devEndpoint.host),
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
      "VERCEL_PURGE_TOKEN", // Vercel token allowed to purge the server project's CDN cache
    ].map((name) => new sst.Secret(name));
    const spiceWorldServer = new vercel.Project("spice-world-server", {
      name: "spice-world-server",
      framework: "container", // builds Dockerfile.vercel from the repo root
      resourceConfig: { functionDefaultRegions: ["fra1"] }, // same region as the Neon DB (Frankfurt)
      gitRepository: {
        type: "github",
        repo: "Teyik0/spice-world",
      },
      vercelAuthentication: { deploymentType: "none" }, // the web proxy calls it server side; Better Auth guards the API
    });
    // Keeps the spice-world-web name: its domain is the auth and OAuth origin.
    const spiceWorldDashboard = new vercel.Project("spice-world-web", {
      name: "spice-world-web",
      rootDirectory: "apps/dashboard", // Furin Build Output API: see apps/dashboard/vercel.json
      resourceConfig: { functionDefaultRegions: ["fra1"] },
      gitRepository: {
        type: "github",
        repo: "Teyik0/spice-world",
      },
    });
    new vercel.ProjectEnvironmentVariables("spice-world-web-env", {
      projectId: spiceWorldDashboard.id,
      variables: [
        {
          key: "API_URL",
          value: "https://spice-world-server.vercel.app",
          targets: ["production", "preview"], // PR deployments override it with their own server
          sensitive: false,
        },
      ],
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
        // CDN purge through the REST API (apps/server/src/lib/cdn.ts)
        {
          key: "VERCEL_PROJECT_ID",
          value: spiceWorldServer.id,
          targets: ["production", "preview"], // a local write must not purge the deployed cache
          sensitive: false,
        },
        {
          key: "VERCEL_TEAM_ID",
          value: "team_jKy3xXivkDGmI01SAr9Bo9d1",
          targets: ["production", "preview"], // a local write must not purge the deployed cache
          sensitive: false,
        },
        {
          key: "DATABASE_URL",
          value: database.properties.devConnectionString,
          targets: ["development", "preview"], // PR deployments override it with their own branch
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
        directory: "apps/dashboard",
        title: "Furin Dashboard",
      },
    });
    // Values to copy into GitHub (vars/secrets) for the preview workflow.
    return {
      NEON_PROJECT_ID: neonProject.id,
      VERCEL_SERVER_PROJECT_ID: spiceWorldServer.id,
      VERCEL_WEB_PROJECT_ID: spiceWorldDashboard.id,
    };
  },
});
