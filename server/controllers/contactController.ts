import { Request, Response } from 'express';
import { Contact, ContactSubject } from '../models/Contact.ts';
import { logger } from '../utils/logger.ts';
import { getClientIp } from '../utils/requestIp.ts';
import { AppError } from '../utils/appError.ts';

const MAX_STRING_LENGTH = {
  name: 120,
  email: 254,
  username: 64,
  subject: 150,
  message: 5000,
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const sanitizeString = (value: unknown, maxLength: number): string => {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
};

/**
 * Controller: submitContactForm
 * Processes public contact form submissions with validation, rate limiting, and geo metadata.
 */
export const submitContactForm = async (req: Request, res: Response) => {
  const rawBody = req.body || {};

  const name = sanitizeString(rawBody.name, MAX_STRING_LENGTH.name);
  const email = sanitizeString(rawBody.email, MAX_STRING_LENGTH.email).toLowerCase();
  const username = sanitizeString(rawBody.username, MAX_STRING_LENGTH.username);
  const subjectRaw = sanitizeString(rawBody.subject, MAX_STRING_LENGTH.subject);
  const message = sanitizeString(rawBody.message, MAX_STRING_LENGTH.message);

  if (!name || !email || !username || !subjectRaw || !message) {
    throw AppError.badRequest('All required fields must be provided.', 'MISSING_FIELDS');
  }

  if (!EMAIL_REGEX.test(email)) {
    throw AppError.badRequest('Please provide a valid email address.', 'INVALID_EMAIL');
  }

  if (message.length < 5) {
    throw AppError.badRequest('Message must be at least 5 characters long.', 'MESSAGE_TOO_SHORT');
  }

  // Verify subject matches known enum values or sanitize to closest fallback
  const validSubjects = Object.values(ContactSubject) as string[];
  const subject = validSubjects.includes(subjectRaw)
    ? (subjectRaw as ContactSubject)
    : ContactSubject.GENERAL;

  const ipAddress = getClientIp(req);
  const userAgent = (req.get('user-agent') || 'unknown').slice(0, 512);

  let geolocation: Record<string, unknown> | null = null;
  try {
    if (
      ipAddress &&
      ipAddress !== 'unknown' &&
      ipAddress !== '127.0.0.1' &&
      ipAddress !== '::1' &&
      !ipAddress.startsWith('10.') &&
      !ipAddress.startsWith('192.168.') &&
      !ipAddress.startsWith('172.')
    ) {
      const geoUrl = `https://free.freeipapi.com/api/json/${encodeURIComponent(ipAddress)}`;
      const geoResponse = await fetch(geoUrl, {
        signal: AbortSignal.timeout(2500),
      });
      if (geoResponse.ok) {
        const geoData = (await geoResponse.json()) as Record<string, unknown>;
        geolocation = {
          countryName: geoData.countryName,
          countryCode: geoData.countryCode,
          cityName: geoData.cityName,
          regionName: geoData.regionName,
          latitude: geoData.latitude,
          longitude: geoData.longitude,
        };
      }
    }
  } catch (geoError) {
    logger.debug('Failed to fetch geolocation for contact submission', {
      ipAddress,
      error: geoError instanceof Error ? geoError.message : 'Unknown',
    });
  }

  const newContact = new Contact({
    name,
    email,
    username,
    subject,
    message,
    ipAddress,
    userAgent,
    geolocation,
  });

  let savedContact;
  try {
    savedContact = await newContact.save();
  } catch (saveError: any) {
    // If referenceId collision occurs, retry generation once
    if (saveError.code === 11000 && saveError.keyPattern?.referenceId) {
      logger.warn('Reference ID collision occurred, retrying with new referenceId', {
        collisionId: newContact.referenceId,
      });
      (newContact as any).referenceId = undefined;
      savedContact = await newContact.save();
    } else {
      logger.error('Failed to save contact message to database', {
        error: saveError?.message,
        code: saveError?.code,
      });
      throw AppError.internal(
        'An error occurred while saving your message. Please try again.',
        'STORAGE_ERROR',
      );
    }
  }

  logger.info('Contact form submission successful', {
    referenceId: savedContact.referenceId,
    requestId: (req as any).requestId,
  });

  return res.status(201).json({
    success: true,
    message: 'Your message has been received successfully.',
    referenceId: savedContact.referenceId,
    data: { referenceId: savedContact.referenceId },
  });
};
