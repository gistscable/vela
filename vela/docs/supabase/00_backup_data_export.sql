-- STEP 2 (dashboard-only backup) — READ ONLY. One row: when it was taken, how many rows each table had, and ALL the
-- data of every table as one JSON value. Click "Export" above the results and choose "Download CSV", then keep the
-- file private (it contains password hashes). It does not change anything. It is a data backup; the table structure
-- can always be rebuilt from prisma/migrations.
SELECT now() AS taken_at,
  json_build_object(
    'User', (SELECT count(*) FROM "User"),
    'Account', (SELECT count(*) FROM "Account"),
    'Transaction', (SELECT count(*) FROM "Transaction"),
    'Card', (SELECT count(*) FROM "Card"),
    'Payee', (SELECT count(*) FROM "Payee"),
    'BillPayee', (SELECT count(*) FROM "BillPayee"),
    'BillPayment', (SELECT count(*) FROM "BillPayment"),
    'LinkedBank', (SELECT count(*) FROM "LinkedBank"),
    'FundingIntent', (SELECT count(*) FROM "FundingIntent"),
    'MoneyRequest', (SELECT count(*) FROM "MoneyRequest"),
    'ProcessorEvent', (SELECT count(*) FROM "ProcessorEvent"),
    'ExternalAccount', (SELECT count(*) FROM "ExternalAccount")
  ) AS row_counts,
  json_build_object(
    'User', (SELECT COALESCE(json_agg(t), '[]'::json) FROM "User" t),
    'Account', (SELECT COALESCE(json_agg(t), '[]'::json) FROM "Account" t),
    'Transaction', (SELECT COALESCE(json_agg(t), '[]'::json) FROM "Transaction" t),
    'Card', (SELECT COALESCE(json_agg(t), '[]'::json) FROM "Card" t),
    'Payee', (SELECT COALESCE(json_agg(t), '[]'::json) FROM "Payee" t),
    'BillPayee', (SELECT COALESCE(json_agg(t), '[]'::json) FROM "BillPayee" t),
    'BillPayment', (SELECT COALESCE(json_agg(t), '[]'::json) FROM "BillPayment" t),
    'LinkedBank', (SELECT COALESCE(json_agg(t), '[]'::json) FROM "LinkedBank" t),
    'FundingIntent', (SELECT COALESCE(json_agg(t), '[]'::json) FROM "FundingIntent" t),
    'MoneyRequest', (SELECT COALESCE(json_agg(t), '[]'::json) FROM "MoneyRequest" t),
    'ProcessorEvent', (SELECT COALESCE(json_agg(t), '[]'::json) FROM "ProcessorEvent" t),
    'ExternalAccount', (SELECT COALESCE(json_agg(t), '[]'::json) FROM "ExternalAccount" t)
  ) AS backup_data;
