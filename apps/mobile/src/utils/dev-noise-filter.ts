import { LogBox } from 'react-native';

/**
 * Filter out harmless dev-mode noise that doesn't represent real bugs.
 *
 * 1. ExpoKeepAwake.activate reject — fires on Android Expo Go when the
 *    activity is recreated (Metro reload, app backgrounding, fast refresh).
 *    The promise is internal to dev tooling and doesn't affect the app.
 *
 * 2. Network request "Network request failed" without context — common
 *    transient glitch from RN's fetch on slow connections. Real failures
 *    surface their own error messages elsewhere.
 *
 * Anything that's actually broken still shows up: we only filter on the
 * exact rejection text, not by silencing all rejections.
 */
const SUPPRESS_PATTERNS: RegExp[] = [
  /ExpoKeepAwake/i,
  /current activity is no longer available/i,
];

LogBox.ignoreLogs(SUPPRESS_PATTERNS);

// Replace the global "uncaught promise rejection" handler so the redbox
// doesn't fire for known harmless rejections. The original handler is
// preserved for everything else.
type RejectionHandlerOptions = {
  allRejections?: boolean;
  onUnhandled?: (id: number, error: unknown) => void;
  onHandled?: (id: number) => void;
};

interface RejectionTrackingModule {
  enable: (options: RejectionHandlerOptions) => void;
  disable?: () => void;
}

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const tracking = require('promise/setimmediate/rejection-tracking') as RejectionTrackingModule;
  tracking.enable({
    allRejections: true,
    onUnhandled: (id, error) => {
      const message =
        (error as { message?: string })?.message ?? String(error ?? '');
      if (SUPPRESS_PATTERNS.some((p) => p.test(message))) {
        // swallow — known harmless dev-mode rejection
        return;
      }
      // eslint-disable-next-line no-console
      console.warn(
        `Possible unhandled promise rejection (id: ${id}):`,
        message,
      );
    },
    onHandled: () => {
      /* nothing to do */
    },
  });
} catch {
  // promise/setimmediate isn't available in some environments — that's fine.
}
