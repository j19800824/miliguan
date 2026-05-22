import * as Sentry from '@sentry/nextjs';

const sentryOptions: Sentry.NodeOptions | Sentry.EdgeOptions = {
  // Sentry DSN
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Enable Spotlight in development
  spotlight: process.env.NODE_ENV === 'development',

  // Adds request headers and IP for users, for more info visit
  sendDefaultPii: true,

  // Adjust this value in production, or use tracesSampler for greater control
  tracesSampleRate: 1,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false
};

export async function register() {
  if (!process.env.NEXT_PUBLIC_SENTRY_DISABLED) {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
      // Node.js Sentry configuration
      Sentry.init(sentryOptions);
    }

    if (process.env.NEXT_RUNTIME === 'edge') {
      // Edge Sentry configuration
      Sentry.init(sentryOptions);
    }
  }

  // Cron registration — only in long-running Node server, not edge or
  // build-time. Dynamic import so this code is dead-stripped from the
  // edge bundle and the build manifest.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const { registerCronJobs } = await import('./lib/cron');
      registerCronJobs();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[instrumentation] failed to register cron jobs', err);
    }
  }
}

export const onRequestError = Sentry.captureRequestError;
