import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import ReactGA from 'react-ga4';

const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_ID;
const IS_PRODUCTION = import.meta.env.PROD;

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

let hasInitialized = false;
let gaClient = ReactGA;

const getGaClient = async () => {
  if (gaClient && typeof gaClient.initialize === 'function') {
    return gaClient;
  }

  gaClient = null;
  console.warn('Analytics client unavailable; analytics disabled.');
  return null;
};

const isAnalyticsEnabled = () => {
  if (!IS_PRODUCTION) return false;
  if (!GA_MEASUREMENT_ID) return false;
  return !LOCAL_HOSTS.has(window.location.hostname);
};

export const initializeAnalytics = async () => {
  if (hasInitialized || !isAnalyticsEnabled()) return false;

  try {
    const ReactGA = await getGaClient();
    if (!ReactGA) return false;

    ReactGA.initialize(GA_MEASUREMENT_ID);
    hasInitialized = true;
    return true;
  } catch (error) {
    console.warn('Analytics initialization failed; analytics disabled.', error);
    return false;
  }
};

export const trackPageView = (path, title) => {
  if (!hasInitialized || !gaClient) return;

  gaClient.send({
    hitType: 'pageview',
    page: path,
    title,
  });
};

export const trackEvent = (action, category = 'engagement', label, value) => {
  if (!hasInitialized || !gaClient) return;

  gaClient.event({
    action,
    category,
    label,
    value,
  });
};

export const trackButtonClick = (buttonName, location = 'unknown') => {
  trackEvent('button_click', 'ui_interaction', `${buttonName}:${location}`);
};

export const trackFeatureUsage = (featureName, context = 'app') => {
  trackEvent('feature_usage', 'feature_engagement', `${featureName}:${context}`);
};

export const trackError = (errorName, source = 'client', details) => {
  if (!hasInitialized || !gaClient) return;

  gaClient.event({
    action: 'app_error',
    category: 'error',
    label: `${errorName}:${source}`,
    ...(details ? { value: Number(details) || undefined } : {}),
  });
};

export const useAnalyticsPageTracking = () => {
  const location = useLocation();
  const lastTrackedPathRef = useRef('');

  useEffect(() => {
    void initializeAnalytics();
  }, []);

  useEffect(() => {
    if (!hasInitialized) return;

    const currentPath = `${location.pathname}${location.search}${location.hash}`;
    if (lastTrackedPathRef.current === currentPath) return;

    lastTrackedPathRef.current = currentPath;
    trackPageView(currentPath, document.title);
  }, [location.pathname, location.search, location.hash]);
};
