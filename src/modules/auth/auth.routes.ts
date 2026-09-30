import { Router } from 'express';
import * as authController from './auth.controller';
import { authRateLimiter } from '../../middleware/rateLimit.middleware';
import { requireAuth } from '../../middleware/auth.middleware';
import { catchAsync } from '../../utils/catchAsync';

const router = Router();

router.post('/signup', authRateLimiter, catchAsync(authController.signupHandler));
router.post('/verify-email', authRateLimiter, catchAsync(authController.verifyEmailHandler));
router.post(
  '/resend-verification',
  authRateLimiter,
  catchAsync(authController.resendVerificationHandler),
);
router.post('/login', authRateLimiter, catchAsync(authController.loginHandler));
router.post('/refresh', catchAsync(authController.refreshHandler));
router.post('/logout', catchAsync(authController.logoutHandler));
router.post('/forgot-password', authRateLimiter, catchAsync(authController.forgotPasswordHandler));
router.post('/reset-password', authRateLimiter, catchAsync(authController.resetPasswordHandler));

// First protected route: requireAuth runs first and populates req.user
router.get('/me', requireAuth, catchAsync(authController.meHandler));

export default router;