-- health-probe's pages-deploy check skips, without alerting, any GitHub API reply it cannot use.
-- From 2026-11-15 it also counts those skips in a row, in health_alert_state under the row
-- 'pages-deploy:skipped' (skips is the count, last_alert_at is when the run of skips began), and
-- six in a row alert as pages-deploy-blind (checks.ts nextSkipRun, pagesDeployBlind).
--
-- This adds the count column. Every other row keeps skips at 0 and is read exactly as before.
-- Until this is applied, the probe's write of the count fails, is logged, and the check behaves
-- as it did before: so either order of migration and function deploy is safe. Safe to run twice.

alter table public.health_alert_state
  add column if not exists skips integer not null default 0;
