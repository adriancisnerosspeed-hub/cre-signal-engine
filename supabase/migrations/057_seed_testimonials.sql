-- Seed marketing testimonials (idempotent: skip if any row exists).
INSERT INTO testimonials (firm_type, persona, quote, attribution, deal_context, sort_order, active)
SELECT * FROM (VALUES
  (
    'Mid-market multifamily fund',
    'Principal',
    'We had blind spots on Austin-area office-adjacent exposure. CRE Signal gave us a single risk language across deals and frozen cohort context — IC stopped debating definitions and started debating capital.',
    'Principal, multifamily fund (Southwest US)',
    'Austin-area office → multifamily repositioning pipeline',
    0,
    true
  ),
  (
    'Debt origination',
    'Head of Credit',
    'Standardized IC memos cut our cycle time materially. The deterministic Risk Index and versioned exports mean credit and originations aren''t arguing about the math — they''re aligned on the packet.',
    'Head of Credit, CRE lending platform',
    'Bridge and construction lending book',
    1,
    true
  ),
  (
    'Syndicator / GP',
    'Managing Partner',
    'LPs ask for governance, not buzzwords. The audit trail and policy framing gave us a credible layer our PPM didn''t have to invent — it''s defensible under diligence.',
    'Managing Partner, real estate syndication',
    'Multi-asset value-add raise',
    2,
    true
  )
) AS v(firm_type, persona, quote, attribution, deal_context, sort_order, active)
WHERE NOT EXISTS (SELECT 1 FROM testimonials LIMIT 1);
