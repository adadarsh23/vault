import { Request, Response } from 'express';
import { Contact } from '../models/Contact.ts';
import { logger } from '../utils/logger.ts';
import { getClientIp } from '../utils/requestIp.ts';

export const submitContactForm = async (req: Request, res: Response) => {
  try {
    const { name, email, username, subject, message } = req.body;

    // Server-side validation check (in addition to schema validation)
    if (!name || !email || !username || !subject || !message) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_FIELDS',
          message: 'All required fields must be provided.',
        },
      });
    }

    const ipAddress = getClientIp(req);
    const userAgent = req.get('user-agent') || 'unknown';

    let geolocation = null;
    try {
      if (ipAddress !== 'unknown' && ipAddress !== '127.0.0.1' && ipAddress !== '::1') {
        const geoUrl = `https://free.freeipapi.com/api/json/${ipAddress}`;
        const geoResponse = await fetch(geoUrl, {
          signal: AbortSignal.timeout(8000),
        });
        if (geoResponse.ok) {
          geolocation = await geoResponse.json();
        }
      }
    } catch (e) {
      logger.warn('Failed to fetch geolocation for contact submission', {
        ipAddress,
        error: e instanceof Error ? e.message : 'Unknown',
      });
    }

    const newContact = new Contact({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      username: username.trim(),
      subject,
      message: message.trim(),
      ipAddress,
      userAgent,
      geolocation,
    });

    let savedContact;
    try {
      savedContact = await newContact.save();
    } catch (saveError: any) {
      // If referenceId collision (rare but possible), try once more
      if (saveError.code === 11000 && saveError.keyPattern?.referenceId) {
        logger.warn('Reference ID collision occurred, retrying...', {
          collisionId: newContact.referenceId,
        });
        (newContact as any).referenceId = undefined; // Trigger re-generation in pre-save hook
        savedContact = await newContact.save();
      } else {
        throw saveError;
      }
    }

    logger.info('Contact form submission successful', {
      referenceId: savedContact.referenceId,
      email: savedContact.email,
      requestId: (req as any).requestId,
    });

    return res.status(201).json({
      success: true,
      message: 'Your message has been received successfully.',
      referenceId: savedContact.referenceId,
    });
  } catch (error: any) {
    const requestId = (req as any).requestId;

    // Handle specific MongoDB/Mongoose errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((err: any) => err.message);
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: messages[0] || 'Invalid data provided.',
          requestId,
        },
      });
    }

    // Handle Duplicate Key Errors (e.g., persistent collision or email/username index issues)
    if (error.code === 11000 || error.name === 'MongoServerError') {
      logger.error('Contact form terminal database error', {
        error: error.message,
        code: error.code,
        keyPattern: error.keyPattern,
        requestId,
      });

      return res.status(500).json({
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message:
            'An internal storage error occurred. Please try again or contact support directly.',
          requestId,
        },
      });
    }

    logger.error('Unexpected error in contact form submission', {
      error: error.message,
      stack: error.stack,
      requestId,
    });

    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message:
          process.env.NODE_ENV === 'development'
            ? `Server Error: ${error.message}`
            : 'An unexpected error occurred. Please try again later.',
        requestId,
      },
    });
  }
};
