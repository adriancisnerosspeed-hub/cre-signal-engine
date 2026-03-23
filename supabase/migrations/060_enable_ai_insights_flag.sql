-- Enable AI insights feature flag for PRO+ and ENTERPRISE users
INSERT INTO feature_flags (name, enabled)
VALUES ('ai-insights', true)
ON CONFLICT (name) DO UPDATE SET enabled = true;
