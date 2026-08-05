-- Migration: 0003_add_admin_user_corrected
-- This migration ensures the admin user and role exist, then assigns the role.

-- 1. Insert the user profile if it doesn't exist.
INSERT OR IGNORE INTO UserProfiles (id, email, nickname) VALUES ('XSXVaGXi0YanOxkJOkrLP0TqPvw1', 'digitalboyzone@gmail.com', 'Admin');

-- 2. Insert the 'admin' role if it doesn't exist.
INSERT OR IGNORE INTO Roles (name) VALUES ('admin');

-- 3. Assign the 'admin' role to the user.
INSERT OR IGNORE INTO UserRoles (user_id, role_id)
SELECT 'XSXVaGXi0YanOxkJOkrLP0TqPvw1', id FROM Roles WHERE name = 'admin';
