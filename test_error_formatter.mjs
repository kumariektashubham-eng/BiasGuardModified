import { formatApiError, formatValidationErrorsList } from './frontend/src/utils/errorFormatter.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`[PASS] ${message}`);
    passed++;
  } else {
    console.error(`[FAIL] ${message}`);
    failed++;
  }
}

console.log('--- Starting formatApiError Comprehensive Verification ---\n');

// Scenario 1: Null/Undefined / Valid Registration (fallback handling)
const res1 = formatApiError(null, 'Operation succeeded or no error');
assert(typeof res1 === 'string' && res1 === 'Operation succeeded or no error', 'Scenario 1: Handles null/non-error cleanly with string');

// Scenario 2: Invalid Email Registration (Pydantic v2 validation error)
const pydanticEmailError = {
  response: {
    status: 422,
    data: {
      detail: [
        {
          type: "value_error",
          loc: ["body", "email"],
          msg: "value is not a valid email address: The email address is not valid. It must have exactly one @-sign.",
          input: "invalid_email_string",
          ctx: { reason: "The email address is not valid." }
        }
      ]
    }
  }
};
const res2 = formatApiError(pydanticEmailError);
assert(typeof res2 === 'string' && res2.includes('email') && !res2.includes('[object Object]'), `Scenario 2: Invalid email returns human-readable string: "${res2}"`);

// Scenario 3: Missing Required Fields
const pydanticMissingFields = {
  response: {
    status: 422,
    data: {
      detail: [
        {
          type: "missing",
          loc: ["body", "full_name"],
          msg: "Field required",
          input: null
        },
        {
          type: "missing",
          loc: ["body", "role"],
          msg: "Field required",
          input: null
        }
      ]
    }
  }
};
const res3 = formatApiError(pydanticMissingFields);
assert(typeof res3 === 'string' && res3.includes('full_name') && res3.includes('role'), `Scenario 3: Missing fields formatted cleanly: "${res3}"`);

// Scenario 4: Duplicate Email (409 Conflict or 400 Bad Request with detail)
const duplicateEmailError = {
  response: {
    status: 400,
    data: {
      detail: "A user with this email address already exists in the system."
    }
  }
};
const res4 = formatApiError(duplicateEmailError);
assert(res4 === "A user with this email address already exists in the system.", `Scenario 4: Duplicate email preserves detail string: "${res4}"`);

// Scenario 5: Incorrect Login Credentials (401 Unauthorized with detail)
const incorrectLoginError = {
  response: {
    status: 401,
    data: {
      detail: "Incorrect email or password."
    }
  }
};
const res5 = formatApiError(incorrectLoginError);
assert(res5 === "Incorrect email or password.", `Scenario 5: Incorrect credentials formatted correctly: "${res5}"`);

// Scenario 6: MongoDB / Database Temporarily Unavailable (503 Service Unavailable without body)
const mongoUnavailableError = {
  response: {
    status: 503,
    data: null
  }
};
const res6 = formatApiError(mongoUnavailableError);
assert(res6.includes('unavailable') || res6.includes('offline'), `Scenario 6: 503 status yields service unavailable message: "${res6}"`);

// Scenario 7: Full FastAPI / Pydantic Error Array directly or in response
const rawArrayError = [
  {
    type: "string_too_short",
    loc: ["body", "password"],
    msg: "String should have at least 8 characters",
    input: "secret123",
    ctx: { min_length: 8 }
  },
  {
    type: "greater_than_equal",
    loc: ["body", "experience_years"],
    msg: "Input should be greater than or equal to 0",
    input: -1,
    ctx: { ge: 0 }
  }
];
const res7 = formatApiError(rawArrayError);
assert(typeof res7 === 'string' && res7.includes('password') && !res7.includes('secret123') && res7.includes('experience_years'), `Scenario 7: Direct Pydantic array formatted and password sanitized: "${res7}"`);

// Scenario 8: Network Connection Failure (Axios ERR_NETWORK or offline)
const networkError = {
  code: 'ERR_NETWORK',
  message: 'Network Error'
};
const res8 = formatApiError(networkError);
assert(res8.includes('Unable to connect to the BiasGuard server'), `Scenario 8: Network error handled cleanly: "${res8}"`);

// Scenario 9: Unexpected Backend Error Object (non-standard nested object)
const unexpectedObjectError = {
  response: {
    status: 500,
    data: {
      detail: {
        error_code: "DB_TIMEOUT_8812",
        reason: "Connection to replica set member timed out",
        cluster: "cluster0.mz2fcwx.mongodb.net"
      }
    }
  }
};
const res9 = formatApiError(unexpectedObjectError);
assert(typeof res9 === 'string' && res9.includes('DB_TIMEOUT_8812') && !res9.includes('[object Object]'), `Scenario 9: Unexpected backend error object serialized to string: "${res9}"`);

// Additional Guarantee: Return value is ALWAYS a string
const edgeCases = [
  undefined,
  null,
  123,
  true,
  false,
  {},
  [],
  { foo: { bar: 1 } },
  new Error('Boom'),
  { response: { status: 404 } }
];

let allStrings = true;
for (const ec of edgeCases) {
  const formatted = formatApiError(ec);
  if (typeof formatted !== 'string' || formatted.includes('[object Object]')) {
    allStrings = false;
    console.error(`Edge case failed for input ${JSON.stringify(ec)}: got "${formatted}"`);
  }
}
assert(allStrings, 'React Guarantee: All edge cases return non-object string representation, zero [object Object]');

console.log(`\n--- Verification Complete: ${passed} passed, ${failed} failed ---`);
if (failed > 0) process.exit(1);
