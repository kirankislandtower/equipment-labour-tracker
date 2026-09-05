-- Run this in the Supabase SQL Editor, AFTER add_foreman_phone_number.sql.
--
-- Best-effort match against the staff roster screenshots you shared, cross-checked
-- against every foreman name actually seen rendered by this app across this whole
-- session (Foreman Reports, Attendance, and the Foreman list itself) -- not just
-- the 8 names visible in the one Foreman-list screenshot. The rest of the 45 need
-- the fuller list or the PDF you mentioned; send that and I'll do the rest the
-- same way.
--
-- Skipped on purpose:
--   - Basir Alam (S-191, Civil Charge Hand) -- no phone number listed for them
--     in the roster screenshot.
--   - "Bharath" -- the roster only has "Bharath Jee" (H-14, Charge Hand,
--     +971 52 660 6228). Left out since I can't confirm that's the same person
--     as the "Bharath" your Foreman list shows (could be a shortened name, or a
--     different person entirely) -- add it via the app's edit modal if it's a
--     match, since a wrong guess here would misattribute someone else's number.
--
-- Safe to re-run. Matches by exact name (case/whitespace-insensitive) and only
-- against FOREMAN accounts, so it can't accidentally overwrite an admin's row.

UPDATE users SET phone_number = '+971 54 308 0744' WHERE full_name ILIKE 'Abdul Razak KS' AND role = 'FOREMAN';
UPDATE users SET phone_number = '+971 56 863 4579' WHERE full_name ILIKE 'Aneesh kumar K Gopalakrishnan Nair' AND role = 'FOREMAN';
UPDATE users SET phone_number = '+971 50 612 2694' WHERE full_name ILIKE 'Anil kumar VS' AND role = 'FOREMAN';
UPDATE users SET phone_number = '+971 52 413 3138' WHERE full_name ILIKE 'Anil Kumar.K' AND role = 'FOREMAN';
UPDATE users SET phone_number = '+971 52 660 5575' WHERE full_name ILIKE 'Anil Kumar.T.S' AND role = 'FOREMAN';
UPDATE users SET phone_number = '+971 50 839 2855' WHERE full_name ILIKE 'Balwinder Singh' AND role = 'FOREMAN';

-- These three were seen by name in other admin screens earlier in this session
-- (Foreman Reports activity cards, Attendance login/logout cards), confirming
-- they're real accounts in this system, not just roster entries:
UPDATE users SET phone_number = '+971 52 660 6048' WHERE full_name ILIKE 'Saleendran' AND role = 'FOREMAN';
UPDATE users SET phone_number = '+971 54 995 3408' WHERE full_name ILIKE 'Rabindra Kumar Yadav' AND role = 'FOREMAN';
UPDATE users SET phone_number = '+971 52 660 6433' WHERE full_name ILIKE 'Sushant Behera' AND role = 'FOREMAN';

-- From the rest of the roster (not yet confirmed against your Foreman list, but
-- ready to run once you tell me these names exist there too, or send the rest of
-- the list):
-- Sreejith.B, Giasudheen, Sunil Surendran, Ibrahim, Ujjal Paul, Noor Nabi,
-- Sreejith Janardhanan, Nasiruddin, Sudessan, Mallick Anadi Charan,
-- Sajimon, Chandraseskhar Kumar, Shamsahad Khan, Sukh Dev Singh,
-- Shabeer khan Mohammed, Bharath Jee, Raju Dong, Satnam Singh,
-- TOWHID MIAH ARES MIAH, Prasanna Kumar, Govinda, Sukesh, Mukesh Kumar,
-- Md Afajuddin, Kartick Sarkar, Laiju Venugopalan, Shamshulkah Alladdin Khan,
-- Iftekhar Ahmad, Suresh Kumar Gopalan, Gopalakrishnan,
-- Naveen Kumar, Raju Islam, MD Irshad Ahmad
