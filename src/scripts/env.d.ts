/**
 * Build-time constants inlined by esbuild `define` (see build-scripts/build.js).
 * `process` does not exist in the browser at runtime; only the keys declared
 * here are replaced with literals. A key may only be added here together with
 * a matching `define` entry in build-scripts/build.js (applied to every
 * bundle) and a line in .env.example.
 */
declare const process: {
  env: {
    LEGAL_NOTICE_URL: string;
    PRIVACY_POLICY_URL: string;
    LICENSE_URL: string;
  };
};
