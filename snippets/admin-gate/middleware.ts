/**
 * Admin gate middleware chain.
 *
 * Sanitized excerpt. Production version has more error-shape consistency,
 * structured logging, and an audit-log emit on every reject. Trimmed here
 * to highlight the gate logic itself.
 *
 * Usage:
 *   router.use(authenticateJWT);
 *   router.use(requireRole(['admin', 'moderator']));
 *   router.use(requireTwoFactor);
 *   router.use(requirePasskey);    // only on write routes
 *   router.post('/users/:id/ban', banUser);
 */
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import argon2 from 'argon2';

interface AuthedRequest extends Request {
  user?: {
    id: string;
    role: 'user' | 'moderator' | 'admin';
    twoFactorVerifiedAt?: number;
  };
}

const ACCESS_SECRET = process.env.JWT_SECRET!;
const PASSKEY_SECRET = process.env.PASSKEY_SECRET!;
const PASSKEY_TTL_SECONDS = 15 * 60;

/** Layer 1: JWT signature + expiry. */
export function authenticateJWT(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.header('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHENTICATED', message: 'Authentication required' },
    });
  }

  try {
    const decoded = jwt.verify(token, ACCESS_SECRET) as any;
    req.user = {
      id: decoded.sub,
      role: decoded.role,
      twoFactorVerifiedAt: decoded.tfaAt,
    };
    return next();
  } catch {
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'Token invalid or expired' },
    });
  }
}

/** Layer 2: role. */
export function requireRole(allowed: Array<'admin' | 'moderator'>) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !allowed.includes(req.user.role as any)) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Insufficient role' },
      });
    }
    next();
  };
}

/**
 * Layer 3: TOTP 2FA must have been verified within the current session.
 * The verify endpoint sets `tfaAt` on the access-token JWT, refreshed
 * each time the user re-enters their TOTP code.
 */
export function requireTwoFactor(req: AuthedRequest, res: Response, next: NextFunction) {
  const verified = req.user?.twoFactorVerifiedAt ?? 0;
  const ageSeconds = (Date.now() - verified) / 1000;
  if (ageSeconds > 24 * 60 * 60) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'TWO_FACTOR_REQUIRED',
        message: 'Two-factor reverification required',
      },
    });
  }
  next();
}

/**
 * Layer 4: Admin passkey (6-digit PIN). Verified once via a dedicated
 * endpoint that issues a short-TTL passkey token, then required on
 * every admin write route in the X-Admin-Passkey-Token header.
 */
export function requirePasskey(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = req.header('X-Admin-Passkey-Token');
  if (!token) {
    return res.status(403).json({
      success: false,
      error: { code: 'PASSKEY_REQUIRED', message: 'Admin passkey required' },
    });
  }

  try {
    const decoded = jwt.verify(token, PASSKEY_SECRET) as any;
    if (decoded.sub !== req.user?.id) {
      throw new Error('passkey/user mismatch');
    }
    next();
  } catch {
    return res.status(403).json({
      success: false,
      error: { code: 'PASSKEY_INVALID', message: 'Admin passkey invalid or expired' },
    });
  }
}

/**
 * One-shot endpoint that exchanges a PIN for a short-lived passkey token.
 * Rate-limited at 3 attempts/minute (omitted here — production wires it
 * via express-rate-limit per-user).
 */
export async function verifyPasskey(
  req: AuthedRequest,
  res: Response,
  loadUserPasskeyHash: (userId: string) => Promise<string | null>,
) {
  const { pin } = req.body ?? {};
  if (!/^\d{6}$/.test(pin || '')) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_PIN', message: 'PIN must be 6 digits' },
    });
  }

  const userId = req.user!.id;
  const stored = await loadUserPasskeyHash(userId);
  if (!stored) {
    return res.status(403).json({
      success: false,
      error: { code: 'PASSKEY_NOT_SET', message: 'Set up your admin PIN first' },
    });
  }

  const ok = await argon2.verify(stored, pin);
  if (!ok) {
    // The rate limiter wraps this endpoint; failed attempts increment its
    // counter and a 4th attempt within the window locks for 15 minutes.
    return res.status(403).json({
      success: false,
      error: { code: 'INVALID_PIN', message: 'Invalid PIN' },
    });
  }

  const token = jwt.sign({ sub: userId }, PASSKEY_SECRET, {
    expiresIn: PASSKEY_TTL_SECONDS,
  });

  return res.json({
    success: true,
    data: {
      token,
      expiresAt: new Date(Date.now() + PASSKEY_TTL_SECONDS * 1000).toISOString(),
    },
  });
}
