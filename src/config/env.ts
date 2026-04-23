/**
 * Environment configuration with validation and type safety
 * All sensitive data should be provided via environment variables
 * 
 * SECURITY NOTE: The frontend now communicates with a secure backend proxy
 * instead of directly calling Snowflake APIs. This keeps the PAT token secure
 * on the server side and prevents exposure in browser developer tools.
 */

export interface SnowflakeConfig {
  backendUrl: string;  // URL of our secure backend proxy
  // Legacy fields kept for backward compatibility (not used for API calls)
  account: string;
  host: string;
  warehouse: string;
  demoUser: string;
  demoUserRole: string;
  agentEndpoint: string;
  database: string;
  schema: string;
}

/**
 * Validates that all required environment variables are present
 */
const validateEnvironment = (): SnowflakeConfig => {
  // Primary required variable: backend URL
  // Empty string means "use same origin" (for SPCS/nginx proxy setups)
  // Non-empty string is the actual backend URL (for local dev or separate backend)
  const backendUrl = process.env.REACT_APP_BACKEND_URL;
  
  if (backendUrl === undefined) {
    throw new Error(
      'Missing required environment variable: REACT_APP_BACKEND_URL\n' +
      'For local development: REACT_APP_BACKEND_URL=http://localhost:3001\n' +
      'For SPCS deployment: REACT_APP_BACKEND_URL="" (empty string)\n' +
      'See the README for setup instructions.'
    );
  }
  
  // backendUrl can be empty string (for SPCS) or a URL (for local/separate backend)
  // Both are valid

  // Legacy variables (optional, kept for backward compatibility)
  const legacyVars = {
    account: process.env.REACT_APP_ACCOUNT || 'not-set',
    host: process.env.REACT_APP_HOST || 'not-set',
    warehouse: process.env.REACT_APP_WAREHOUSE || 'not-set',
    demoUser: process.env.REACT_APP_DEMO_USER || 'not-set',
    demoUserRole: process.env.REACT_APP_DEMO_USER_ROLE || 'not-set',
    agentEndpoint: process.env.REACT_APP_AGENT_ENDPOINT || 'not-set',
    database: process.env.REACT_APP_DATABASE || 'snowflake_intelligence',
    schema: process.env.REACT_APP_SCHEMA || 'agents',
  };

  return {
    backendUrl,
    ...legacyVars,
  };
};

/**
 * Validated environment configuration
 * This will throw an error if any required variables are missing
 */
export const config = validateEnvironment();

/**
 * Get configuration status for display (without exposing values)
 */
export const getEnvConfigStatus = () => {
  const requiredEnvVars = [
    { key: 'REACT_APP_BACKEND_URL', label: 'Backend Proxy URL', set: process.env.REACT_APP_BACKEND_URL !== undefined, required: true },
  ];

  const missingRequired = requiredEnvVars.filter(v => v.required && !v.set);
  const allSet = missingRequired.length === 0;

  return {
    envVars: requiredEnvVars,
    allSet,
    missingCount: missingRequired.length
  };
};
