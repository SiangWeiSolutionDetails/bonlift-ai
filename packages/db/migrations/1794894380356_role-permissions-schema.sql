-- Up Migration
CREATE TABLE role_permissions (
    role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    action text NOT NULL,
    CONSTRAINT role_permissions_pkey PRIMARY KEY (role_id, action),
    CONSTRAINT role_permissions_action_check CHECK (action ~ '^[a-z][A-Za-z]*\.[a-z][A-Za-z]*$')
);

-- Brand Owner is an ordinary, editable starting point holding every brand action.
WITH owner_role AS (
    INSERT INTO roles (name, kind) VALUES ('Brand Owner', 'brand') RETURNING id
)
INSERT INTO role_permissions (role_id, action)
SELECT owner_role.id, a.action
FROM owner_role
CROSS JOIN (VALUES
    ('outlets.view'),
    ('outlets.create'),
    ('outlets.edit'),
    ('outlets.delete'),
    ('dataSource.view'),
    ('dataSource.edit'),
    ('snapshots.view'),
    ('snapshots.viewCustomerIds'),
    ('snapshots.upload'),
    ('calculations.view'),
    ('calculations.trigger'),
    ('calculations.editSchedule'),
    ('calculations.publish'),
    ('configs.view'),
    ('configs.edit'),
    ('results.view'),
    ('customerScores.view'),
    ('itemAffinity.view'),
    ('channels.view'),
    ('channels.edit'),
    ('apiKeys.view'),
    ('apiKeys.create'),
    ('apiKeys.revoke'),
    ('apiKeys.delete'),
    ('usage.view'),
    ('feedback.view'),
    ('members.view'),
    ('members.manage')
) AS a(action);

-- Down Migration
DROP TABLE role_permissions;
