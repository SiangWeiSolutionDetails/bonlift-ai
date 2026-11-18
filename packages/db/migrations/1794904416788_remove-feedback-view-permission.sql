-- Up Migration
-- The recommendation feedback report is gone; feedback is now only a customer preference.
DELETE FROM role_permissions
WHERE action = 'feedback.view';

-- Down Migration
-- Only the built-in Brand Owners are known to have held it; grants on other roles cannot be restored.
INSERT INTO role_permissions (role_id, action)
SELECT r.id, 'feedback.view'
FROM roles r
WHERE r.kind = 'brand' AND r.is_builtin
ON CONFLICT (role_id, action) DO NOTHING;
