/**
 * BiasGuard AI - Centralized Error Formatting Utility
 * 
 * Safely parses, formats, and sanitizes API, Axios, Pydantic, and JavaScript errors
 * into human-readable strings. Prevents rendering raw JavaScript objects in React children.
 * 
 * Security: Never exposes raw sensitive input values (passwords, tokens, database credentials).
 */

/**
 * Capitalizes the first character of a string.
 */
function capitalize(str) {
  if (!str || typeof str !== 'string') return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Sanitizes field names from Pydantic loc arrays.
 * Example: ["body", "user", "email"] -> "user.email"
 * Example: ["body", "password"] -> "password"
 */
function formatFieldLocation(loc) {
  if (!Array.isArray(loc) || loc.length === 0) return '';
  // Strip common request wrapper locations
  const cleaned = loc.filter(
    (segment) => segment !== 'body' && segment !== 'query' && segment !== 'path' && segment !== 'header'
  );
  if (cleaned.length === 0) return loc.join('.');
  return cleaned.join('.');
}

/**
 * Formats a single Pydantic/FastAPI validation error object.
 * Sample item: { type: "string_too_short", loc: ["body", "password"], msg: "String should have at least 6 characters", input: "123", ctx: {...} }
 */
function formatPydanticItem(item) {
  if (!item || typeof item !== 'object') {
    return typeof item === 'string' ? item : '';
  }

  const rawMsg = item.msg || item.message || '';
  let msg = typeof rawMsg === 'string' ? rawMsg : JSON.stringify(rawMsg);

  // Clean common redundant Pydantic v2 prefixes
  if (msg.startsWith('Value error, ')) {
    msg = msg.replace(/^Value error,\s*/i, '');
  }
  if (msg.startsWith('String should ')) {
    msg = capitalize(msg);
  }

  const field = formatFieldLocation(item.loc);

  // Security guard: never reflect sensitive inputs from password, token, or secret fields
  const isSensitiveField = field.toLowerCase().includes('password') ||
    field.toLowerCase().includes('secret') ||
    field.toLowerCase().includes('token') ||
    field.toLowerCase().includes('key') ||
    field.toLowerCase().includes('credential');

  if (field) {
    // If msg already mentions field, avoid repetition
    if (msg.toLowerCase().includes(field.toLowerCase())) {
      return capitalize(msg);
    }
    return `Field "${field}": ${capitalize(msg)}`;
  }

  return capitalize(msg) || 'Invalid value submitted';
}

/**
 * Formats an array of Pydantic validation errors into readable strings.
 */
export function formatValidationErrorsList(detail) {
  if (!Array.isArray(detail)) return [];
  return detail
    .map((item) => formatPydanticItem(item))
    .filter((str) => Boolean(str && str.trim()));
}

/**
 * Main Centralized API Error Formatter
 * 
 * Extracts and returns a guaranteed string from any error type:
 * - Pydantic/FastAPI 422 validation error arrays: detail: [{ type, loc, msg, input, ctx }]
 * - FastAPI HTTPException string details: detail: "User already exists"
 * - Nested backend error objects: detail: { error: "Database error" }
 * - Axios Network / timeout / 500 / 503 errors
 * - Standard JavaScript Error instances
 * - String error messages
 * 
 * @param {any} error The error object, string, or response
 * @param {string} [fallbackMessage='An unexpected error occurred. Please try again.'] Default fallback message
 * @returns {string} Guaranteed human-readable string representation
 */
export function formatApiError(error, fallbackMessage = 'An unexpected error occurred. Please try again.') {
  if (!error) {
    return fallbackMessage;
  }

  // 1. If error is already a clean string
  if (typeof error === 'string') {
    const trimmed = error.trim();
    return trimmed.length > 0 ? trimmed : fallbackMessage;
  }

  // 2. Check if error is an array of validation errors directly
  if (Array.isArray(error)) {
    const list = formatValidationErrorsList(error);
    if (list.length > 0) {
      return list.join(' • ');
    }
    return fallbackMessage;
  }

  // 3. Axios Response Handling (error.response)
  if (error.response && typeof error.response === 'object') {
    const { status, data } = error.response;

    if (data) {
      // 3a. FastAPI / Pydantic validation error array (data.detail = [...])
      if (Array.isArray(data.detail)) {
        const list = formatValidationErrorsList(data.detail);
        if (list.length > 0) {
          return list.join(' • ');
        }
      }

      // 3b. Standard FastAPI HTTPException detail string
      if (typeof data.detail === 'string' && data.detail.trim()) {
        return data.detail.trim();
      }

      // 3c. Nested detail object (e.g. detail: { message: "..." })
      if (data.detail && typeof data.detail === 'object') {
        if (typeof data.detail.msg === 'string' && data.detail.msg.trim()) {
          return data.detail.msg.trim();
        }
        if (typeof data.detail.message === 'string' && data.detail.message.trim()) {
          return data.detail.message.trim();
        }
        if (typeof data.detail.error === 'string' && data.detail.error.trim()) {
          return data.detail.error.trim();
        }
        try {
          const parts = Object.entries(data.detail)
            .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
            .filter(Boolean);
          if (parts.length > 0) return parts.join(', ');
        } catch (_) {}
      }

      // 3d. Direct message / error keys on data
      if (typeof data.message === 'string' && data.message.trim()) {
        return data.message.trim();
      }
      if (typeof data.error === 'string' && data.error.trim()) {
        return data.error.trim();
      }

      // 3e. data is a raw string
      if (typeof data === 'string' && data.trim()) {
        return data.trim();
      }
    }

    // 3f. HTTP Status Code specific fallbacks if backend returned no body detail
    if (status === 400) return 'Invalid request: Please check your input and try again.';
    if (status === 401) return 'Authentication required: Incorrect email or password.';
    if (status === 403) return 'Access denied: You do not have permission for this action.';
    if (status === 404) return 'The requested resource was not found.';
    if (status === 409) return 'Conflict: A record with this information already exists.';
    if (status === 413) return 'Payload too large: The uploaded file exceeds the size limit.';
    if (status === 422) return 'Validation error: One or more submitted fields are invalid.';
    if (status === 500) return 'Internal server error: The server encountered an issue processing your request.';
    if (status === 502 || status === 503 || status === 504) {
      return 'Service temporarily unavailable: The backend or database is offline. Please try again shortly.';
    }
  }

  // 4. Axios Request / Network Errors (No response received)
  if (error.code === 'ERR_NETWORK' || error.message === 'Network Error') {
    return 'Unable to connect to the BiasGuard server. Please verify your network connection and ensure the backend is running.';
  }
  if (error.code === 'ECONNABORTED' || (error.message && error.message.toLowerCase().includes('timeout'))) {
    return 'The server request timed out. Please try again.';
  }

  // 5. Standard JavaScript Error (error.message)
  if (typeof error.message === 'string' && error.message.trim()) {
    return error.message.trim();
  }

  // 6. Generic object with toString or fallback
  try {
    if (error.msg && typeof error.msg === 'string') return error.msg;
    if (error.detail && typeof error.detail === 'string') return error.detail;
  } catch (_) {}

  return fallbackMessage;
}

export default formatApiError;
