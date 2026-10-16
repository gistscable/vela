-- STEP 1b — READ ONLY. Run ONLY if script 01a said tracking = TRACKED
-- (if the table does not exist this fails with: relation "_prisma_migrations" does not exist — which also means UNTRACKED).
-- Expected: the five released migrations, each with finished_at set and rolled_back_at empty.
SELECT migration_name, checksum, started_at, finished_at, rolled_back_at, applied_steps_count,
       CASE WHEN finished_at IS NULL AND rolled_back_at IS NULL THEN 'FAILED / UNFINISHED — STOP'
            WHEN rolled_back_at IS NOT NULL THEN 'rolled back'
            ELSE 'applied' END AS state
FROM "_prisma_migrations"
ORDER BY started_at, migration_name;
