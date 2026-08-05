import { Context, Next } from 'hono';
import { Env } from '../index';
import { HonoContextVariables } from '../router';

/**
 * Middleware to verify if the authenticated user has the 'admin' role.
 * This middleware must run AFTER the standard authMiddleware, as it depends on `userId` being in the context.
 */
export const adminMiddleware = async (
  c: Context<{ Bindings: Env; Variables: HonoContextVariables }>,
  next: Next
) => {
  try {
    const userId = c.get('userId');

    // This should technically not be hit if authMiddleware runs first, but it's a good safeguard.
    if (!userId) {
      return c.json({ ok: false, message: 'Authentication required.' }, 401);
    }

    // Query to check for the existence of the 'admin' role for the user.
    const query = `
      SELECT COUNT(ur.user_id) as admin_count
      FROM UserRoles ur
      JOIN Roles r ON ur.role_id = r.id
      WHERE ur.user_id = ? AND r.name = 'admin'
    `;

    const { results } = await c.env.DB.prepare(query).bind(userId).all<{ admin_count: number }>();

    // Check if the count is greater than 0
    if (results && results.length > 0 && results[0].admin_count > 0) {
      // User is an admin, proceed to the next handler
      await next();
    } else {
      // User is not an admin, return a 403 Forbidden error
      return c.json({ ok: false, message: 'Forbidden: Administrator access required.' }, 403);
    }

  } catch (error: any) {
    console.error('[Admin Middleware] Error:', error);
    return c.json(
      {
        ok: false,
        message: 'An internal error occurred while verifying admin privileges.',
        error: error.message,
      },
      500
    );
  }
};
