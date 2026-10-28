/**
 * TypeScript Declarations for Server Sentry Integration
 *
 * @module server/lib/sentry
 */

import type express from 'express';

/**
 * Initializes the Sentry Node.js SDK if enabled via configuration and environment.
 * Safe to invoke multiple times (idempotent).
 *
 * @returns {boolean} True if Sentry initialized successfully; false otherwise.
 */
export function initSentry(): boolean;

/**
 * Creates an Express request handler that creates a Sentry scope
 * and attaches the current request ID as a searchable tag.
 */
export function sentryRequestHandler(): express.RequestHandler;

/**
 * Creates an Express request handler that starts a manual tracing span
 * for measuring request performance, automatically recording HTTP status codes.
 */
export function sentryTracingHandler(): express.RequestHandler;

/**
 * Creates an Express error-handling middleware that forwards unhandled errors to Sentry.
 */
export function sentryErrorHandler(): express.ErrorRequestHandler;

/**
 * Captures an error or exception to Sentry with optional sanitized context metadata.
 *
 * @param {unknown} error - Error object or thrown value.
 * @param {Record<string, unknown>} [context] - Optional additional tags/extra data.
 * @returns {string | null} Sentry event ID if sent; null otherwise.
 */
export function captureException(error: unknown, context?: Record<string, unknown>): string | null;

/**
 * Captures an informational or diagnostic message to Sentry.
 *
 * @param {string} message - Diagnostic message text.
 * @param {string} [level='info'] - Severity level (fatal, error, warning, log, info, debug).
 * @returns {string | null} Sentry event ID if sent; null otherwise.
 */
export function captureMessage(message: string, level?: string): string | null;

/**
 * Associates sanitized user identity metadata with the current Sentry telemetry scope.
 * Strips password hashes, secrets, master keys, and tokens.
 *
 * @param {Record<string, unknown> | null} user - User document or identity payload.
 */
export function setUserContext(user: Record<string, unknown> | null): void;

/**
 * Records a sanitized breadcrumb to aid in tracing issues preceding an error.
 *
 * @param {Record<string, unknown>} breadcrumb - Breadcrumb descriptor.
 */
export function addBreadcrumb(breadcrumb: Record<string, unknown>): void;

/**
 * Registers global process listeners for unhandledRejection and uncaughtException.
 * Ensures Sentry flushes telemetry before triggering shutdown.
 *
 * @param {((reason: string) => void)} [shutdown] - Optional custom shutdown hook.
 */
export function registerProcessHandlers(shutdown?: (reason: string) => void): void;

/**
 * Flushes the Sentry event buffer and closes the client connection.
 *
 * @param {number} [timeoutMs=2000] - Max time in ms to wait for pending events to flush.
 * @returns {Promise<boolean>} True if all events flushed before timeout; false otherwise.
 */
export function flushSentry(timeoutMs?: number): Promise<boolean>;

/**
 * Returns whether Sentry is enabled in the current configuration.
 *
 * @returns {boolean} True if Sentry DSN is present and enabled; false otherwise.
 */
export function sentryIsEnabled(): boolean;

/**
 * Deeply scrubs sensitive keys, protecting against circular references and prototype pollution.
 *
 * @param {unknown} input - Arbitrary data structure.
 * @param {Record<string, unknown>} [options] - Redaction options.
 * @returns {unknown} Scrubbed copy of the input.
 */
export function redactSensitiveData(input: unknown, options?: Record<string, unknown>): unknown;
