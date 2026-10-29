-- Read-only, changes nothing. Lists every active Foreman account's name and
-- username, alphabetically, for the printed attendance/training sheet.
SELECT full_name, email
FROM users
WHERE role = 'FOREMAN' AND deleted_at IS NULL
ORDER BY full_name;
