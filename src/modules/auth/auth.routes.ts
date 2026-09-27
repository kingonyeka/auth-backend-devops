import { Router } from 'express';
import * as authController from './auth.controller';
import { authRateLimiter } from '../../middleware/rateLimit.middleware';
import { catchAsync } from '../../utils/catchAsync';

const router = Router();

router.post('/signup', authRateLimiter, catchAsync(authController.signupHandler));
router.post('/verify-email', authRateLimiter, catchAsync(authController.verifyEmailHandler));
router.post('/login', authRateLimiter, catchAsync(authController.loginHandler));
router.post('/refresh', catchAsync(authController.refreshHandler));
router.post('/logout', catchAsync(authController.logoutHandler));

export default router;
