import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { unstable_readConfig } from 'wrangler';

// Reads each environment the way `wrangler deploy --env <env>` resolves it.
const config = fileURLToPath(new URL('../../wrangler.jsonc', import.meta.url));
const read = (env) => unstable_readConfig({ config, env });
const prod = read('production');
const staging = read('staging');

describe('wrangler environments', () => {
  it('enables safe observability in each environment with separate datasets', () => {
    for (const config of [staging, prod]) {
      expect(config.observability.issues).toEqual({ enabled: true });
      expect(config.observability.traces).toMatchObject({ enabled: true, head_sampling_rate: 0.01 });
      expect(config.observability.logs).toMatchObject({ head_sampling_rate: 1, invocation_logs: false });
      expect(config.observability.redact_query_string).toBe(true);
      expect(config.upload_source_maps).toBe(true);
      expect(config.vars.APP_OBSERVABILITY).toBe('true');
      expect(config.vars).not.toHaveProperty('STAGING_OBSERVABILITY');
    }
    expect(staging.analytics_engine_datasets).toEqual([{ binding: 'APP_METRICS', dataset: 'campuscores_staging_metrics' }]);
    expect(prod.analytics_engine_datasets).toEqual([{ binding: 'APP_METRICS', dataset: 'campuscores_production_metrics' }]);
  });

  it('production never enables the Test_Engine', () => {
    expect(prod.vars).not.toHaveProperty('ENABLE_TEST_ENGINE');
    expect(staging.vars.ENABLE_TEST_ENGINE).toBe('true');
  });

  it('production repeats its own bindings, distinct from staging', () => {
    expect(prod.durable_objects.bindings).toEqual([{ name: 'ROOMS', class_name: 'MatchRoom' }]);
    expect(prod.triggers.crons).toEqual(['* * * * *']);
    expect(prod.hyperdrive.map((h) => h.binding)).toEqual(['HYPERDRIVE_CACHED', 'HYPERDRIVE_UNCACHED']);
    const stagingIds = staging.hyperdrive.map((h) => h.id);
    for (const { id } of prod.hyperdrive) expect(stagingIds).not.toContain(id);
  });

  it('production serves a zone route with its own Clerk vars; staging stays on workers.dev', () => {
    expect(prod.workers_dev).toBe(false);
    expect(prod.routes).toHaveLength(1);
    expect(prod.routes[0].zone_name).toBeTruthy();
    for (const key of ['CLERK_PUBLISHABLE_KEY', 'AUTHORIZED_PARTIES', 'INVITE_REDIRECT_URL']) {
      expect(prod.vars[key]).toBeTruthy();
      expect(prod.vars[key]).not.toBe(staging.vars[key]);
    }
    expect(prod.vars.AUTHORIZED_PARTIES).not.toMatch(/workers\.dev/);
    expect(staging.workers_dev).toBe(true);
  });

  it('keeps Clerk secrets out of the config', () => {
    for (const env of [prod, staging]) {
      expect(env.vars).not.toHaveProperty('CLERK_SECRET_KEY');
      expect(env.vars).not.toHaveProperty('CLERK_JWT_KEY');
    }
  });
});
