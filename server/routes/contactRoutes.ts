import { Router } from 'express';
import { submitContactForm } from '../controllers/contactController.ts';
import rateLimit from 'express-rate-limit';
import { requireTrustedBrowserOrigin } from '../middleware/csrfOriginMiddleware.ts';
import { requireRecaptcha } from '../middleware/recaptchaMiddleware.ts';
import { validate } from '../middleware/validate.ts';
import { contactSchema } from '../validators/contactValidator.ts';

const router = Router();

// Rate limit contact form submissions to prevent spam
const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Limit each IP to 5 submissions per hour
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_SUBMISSIONS',
      message: 'Too many messages from this IP, please try again after an hour.',
    },
  },
});

router.post(
  '/submit',
  requireTrustedBrowserOrigin,
  contactLimiter,
  validate(contactSchema),
  requireRecaptcha({ action: 'contact_submit' }),
  submitContactForm,
);

export { router as contactRouter };
