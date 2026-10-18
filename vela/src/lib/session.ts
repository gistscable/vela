/** Sliding idle timeout for signed-in sessions. Activity refreshes the JWT and cookie. */
export const SESSION_IDLE_SECONDS = 10 * 60;
export const SESSION_IDLE_MS = SESSION_IDLE_SECONDS * 1000;
/** Warn this long before the idle limit so the member can stay signed in. */
export const SESSION_IDLE_WARNING_MS = SESSION_IDLE_MS - 60 * 1000;
export const SESSION_IDLE_LABEL = "10 minutes";
export const SESSION_IDLE_NOTICE = "idle";
export const SESSION_ACTIVITY_STORAGE_KEY = "fmb_last_activity_v1";
export const SESSION_IDLE_EXPIRED_VALUE = "expired";
