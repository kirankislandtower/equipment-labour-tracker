-- Removes all Equipment/Labour/Material entries submitted by the test account
-- "foreman1" (dummy data used during testing). The foreman1 account itself is
-- left alone -- only the entries it created are removed.

-- ============================================================
-- STEP 1 -- Run this first and check the counts look right
-- ============================================================
select
  (select count(*) from equipment_entries where created_by = (select id from users where email = 'foreman1@islandtower.local')) as equipment_entries_to_delete,
  (select count(*) from labour_entries where created_by = (select id from users where email = 'foreman1@islandtower.local')) as labour_entries_to_delete,
  (select count(*) from material_transfers where created_by = (select id from users where email = 'foreman1@islandtower.local')) as material_transfers_to_delete;

-- ============================================================
-- STEP 2 -- Only run this after Step 1's counts look correct.
-- This permanently deletes those rows and cannot be undone.
-- ============================================================
-- delete from equipment_entries where created_by = (select id from users where email = 'foreman1@islandtower.local');
-- delete from labour_entries where created_by = (select id from users where email = 'foreman1@islandtower.local');
-- delete from material_transfers where created_by = (select id from users where email = 'foreman1@islandtower.local');
