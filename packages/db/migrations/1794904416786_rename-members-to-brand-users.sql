-- Up Migration
UPDATE role_permissions
SET action = 'brandUsers.' || substring(action FROM '^members\.(.*)$')
WHERE action IN ('members.view', 'members.manage');

-- Down Migration
UPDATE role_permissions
SET action = 'members.' || substring(action FROM '^brandUsers\.(.*)$')
WHERE action IN ('brandUsers.view', 'brandUsers.manage');
