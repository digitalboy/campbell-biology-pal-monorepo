import { Context } from 'hono';
import { Env } from '../index';
import { HonoContextVariables } from '../router';
import { syncUserService, getUserDashboardStats } from '../services/user.service';
import { SyncUserPayload } from '../models/user.models';

import { getUserProfile, updateUserProfile } from '../services/user.service';

/**
 * Handles the user synchronization request.
 * It expects user id and email from a validated JWT (in a real middleware) or request body.
 */
export const syncUserHandler = async (c: Context<{ Bindings: Env }>) => {
  try {
    // In a real application, this data would come from a trusted source,
    // like a middleware that validates a Firebase JWT.
    const payload = await c.req.json<SyncUserPayload>();

    if (!payload.id || !payload.email) {
      return c.json({ ok: false, message: 'User ID and email are required.' }, 400);
    }

    // If no nickname is provided, create a default one from the email address.
    const nickname = payload.nickname || payload.email.split('@')[0];

    await syncUserService(c.env, {
      id: payload.id,
      email: payload.email,
      nickname: nickname,
      avatar_url: payload.avatar_url,
    });

    return c.json({ ok: true, message: 'User synchronized successfully.' });

  } catch (error: any) {
    console.error('Sync User Error:', error);
    return c.json({ ok: false, message: 'Failed to synchronize user.', error: error.message }, 500);
  }
};

/**
 * Handles the request for the user's learning dashboard statistics.
 */
export const getDashboardStatsHandler = async (
  c: Context<{ Bindings: Env; Variables: HonoContextVariables }>
) => {
  try {
    // In a production environment, an authentication middleware should run before this handler.
    // The middleware would validate the user's token and place their ID into the context.
    // We use `c.get('userId')` to retrieve it.
    const userId = c.get('userId'); // This line is changed
    if (!userId) {
      // This error indicates an issue with the auth middleware or an unauthenticated request.
      return c.json({ ok: false, message: 'Authentication error: User ID not found in context.' }, 401);
    }

    const stats = await getUserDashboardStats(c.env, userId);
    return c.json({ ok: true, data: stats });

  } catch (error: any) {
    console.error('Error fetching dashboard stats:', error);
    return c.json({ ok: false, message: 'Failed to fetch dashboard stats.', error: error.message }, 500);
  }
};

/**
 * Retrieves the user profile, including their roles.
 */
export const getUserProfileHandler = async (
  c: Context<{ Bindings: Env; Variables: HonoContextVariables }>
) => {
  try {
    const userId = c.get('userId');
    if (!userId) {
      return c.json({ ok: false, message: 'Authentication error: User ID not found in context.' }, 401);
    }

    // 1. Fetch the basic user profile
    const userProfile = await getUserProfile(c.env, userId);

    if (!userProfile) {
      return c.json({ ok: false, message: 'User profile not found.' }, 404);
    }

    // 2. Fetch user roles
    const rolesQuery = `
      SELECT r.name FROM Roles r
      JOIN UserRoles ur ON r.id = ur.role_id
      WHERE ur.user_id = ?
    `;
    const { results: roleResults } = await c.env.DB.prepare(rolesQuery).bind(userId).all<{ name: string }>();
    const roles = roleResults ? roleResults.map(r => r.name) : [];

    // 3. Combine profile and roles
    const fullProfile = {
      ...userProfile,
      roles: roles,
    };

    return c.json({ ok: true, data: fullProfile });

  } catch (error: any) {
    console.error('Error fetching user profile:', error);
    return c.json({ ok: false, message: 'Failed to fetch user profile.', error: error.message }, 500);
  }
};

/**
 * Handles the request to update the user's profile.
 */
export const updateUserProfileHandler = async (
  c: Context<{ Bindings: Env; Variables: HonoContextVariables }>
) => {
  try {
    const userId = c.get('userId');
    if (!userId) {
      return c.json({ ok: false, message: 'Authentication error: User ID not found in context.' }, 401);
    }

    // In a real application, you might want to validate the data in `profileData`.
    const profileData = await c.req.json();
    const updatedProfile = await updateUserProfile(c.env, userId, profileData);
    return c.json({ ok: true, data: updatedProfile });

  } catch (error: any) {
    console.error('Error updating user profile:', error);
    return c.json({ ok: false, message: 'Failed to update user profile.', error: error.message }, 500);
  }
};
