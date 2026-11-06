// Reviewed deployment policy; no secrets or paid infrastructure are required.
// Set enabled:false and redeploy to stop API work. An environment override of
// USED_PUBLIC_API_ENABLED=false also disables it, after deployment. Neither
// change is an instant global switch or a substitute for hosting usage limits.
export const publicApiPolicy = Object.freeze({enabled: true});
