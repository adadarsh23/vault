import type express from 'express';

export function initSentry(): boolean;
export function sentryRequestHandler(): express.RequestHandler;
export function sentryTracingHandler(): express.RequestHandler;
export function sentryErrorHandler(): express.ErrorRequestHandler;
export function captureException(error: unknown, context?: Record<string, unknown>): string | null;
export function captureMessage(message: string, level?: string): string | null;
export function setUserContext(user: Record<string, unknown> | null): void;
export function addBreadcrumb(breadcrumb: Record<string, unknown>): void;
export function flushSentry(timeoutMs?: number): Promise<boolean>;
export function sentryIsEnabled(): boolean;
