/**
 * Secure Backend Proxy Server for Snowflake Cortex Agents
 * 
 * This server acts as a proxy between the frontend and Snowflake APIs,
 * keeping the Personal Access Token (PAT) secure on the server side.
 * 
 * Security Features:
 * - PAT is never exposed to the browser/client
 * - CORS configured for specific origins
 * - Request validation and sanitization
 * - Rate limiting to prevent abuse
 * - Proper error handling without exposing sensitive info
 */

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const https = require('https');
require('dotenv').config();
const { HTTP_STATUS, ERROR_MESSAGES, CONFIG } = require('./constants');


const app = express();
// Render uses PORT, local dev uses SERVER_PORT
const PORT = process.env.PORT || process.env.SERVER_PORT || CONFIG.DEFAULT_PORT;

// ============================================================================
// Configuration & Validation
// ============================================================================

/**
 * Validate required environment variables
 */
const validateEnvironment = () => {
  const required = [
    'SNOWFLAKE_HOST',
    'SNOWFLAKE_PAT',
    'SNOWFLAKE_DATABASE',
    'SNOWFLAKE_SCHEMA'
  ];

  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:', missing.join(', '));
    process.exit(1);
  }

  console.log('✅ All required environment variables are set');
};

validateEnvironment();

// Snowflake configuration from environment
const SNOWFLAKE_CONFIG = {
  host: process.env.SNOWFLAKE_HOST,
  pat: process.env.SNOWFLAKE_PAT,
  database: process.env.SNOWFLAKE_DATABASE,
  schema: process.env.SNOWFLAKE_SCHEMA
};

// ============================================================================
// Middleware Configuration
// ============================================================================

/**
 * CORS configuration - restrict to specific origins in production
 */
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    // In development, allow localhost
    if (process.env.NODE_ENV === 'development') {
      return callback(null, true);
    }
    
    // In production, check against allowed origins
    const allowedOrigins = process.env.ALLOWED_ORIGINS 
      ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
      : [];
    
    // Check for wildcard (allow all origins)
    if (allowedOrigins.includes('*')) {
      return callback(null, true);
    }
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`⚠️  Blocked request from unauthorized origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept']
};

app.use(cors(corsOptions));
app.use(express.json());

/**
 * Rate limiting to prevent abuse
 * Adjust limits based on your needs
 */
const limiter = rateLimit({
  windowMs: CONFIG.RATE_LIMIT_WINDOW_MS,
  max: CONFIG.RATE_LIMIT_MAX_REQUESTS,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', limiter);

/**
 * Request logging middleware
 */
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get authentication headers for Snowflake API
 */
const getSnowflakeAuthHeaders = () => ({
  'X-Snowflake-Authorization-Token-Type': 'PROGRAMMATIC_ACCESS_TOKEN',
  'Authorization': `Bearer ${SNOWFLAKE_CONFIG.pat}`,
  'Content-Type': 'application/json',
  'Accept': 'application/json',
  'User-Agent': 'DashAI-Proxy/1.0.0'
});

/**
 * Sanitize error messages to prevent information leakage
 */
const sanitizeError = (error) => {
  // Don't expose internal error details in production
  if (process.env.NODE_ENV === 'production') {
    return {
      message: 'An error occurred while processing your request',
      code: 'INTERNAL_ERROR'
    };
  }
  
  // In development, provide more details (but still sanitize sensitive data)
  return {
    message: error.message?.replace(/Bearer\s+[\w-]+/g, 'Bearer [REDACTED]') || 'Unknown error',
    code: error.code || 'UNKNOWN_ERROR'
  };
};

/**
 * Validate agent name to prevent injection attacks
 */
const validateAgentName = (agentName) => {
  if (!agentName || typeof agentName !== 'string') {
    return false;
  }
  
  // Allow alphanumeric, underscore, hyphen, and dot
  const validPattern = /^[a-zA-Z0-9_\-\.]+$/;
  return validPattern.test(agentName) && agentName.length <= CONFIG.MAX_AGENT_NAME_LENGTH;
};

const writeSseEvent = (res, event, data) => {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
};

const collectStreamBody = (stream) => new Promise((resolve, reject) => {
  const chunks = [];
  stream.on('data', chunk => chunks.push(Buffer.from(chunk)));
  stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  stream.on('error', reject);
});

const postSnowflakeAgentMessage = (endpoint, requestBody) => new Promise((resolve, reject) => {
  const url = new URL(endpoint);
  const payload = JSON.stringify(requestBody);
  const headers = {
    ...getSnowflakeAuthHeaders(),
    Accept: 'text/event-stream, application/json',
    Connection: 'close',
    'Content-Length': Buffer.byteLength(payload)
  };

  const upstreamRequest = https.request({
    method: 'POST',
    hostname: url.hostname,
    port: url.port || 443,
    path: `${url.pathname}${url.search}`,
    headers,
    timeout: 0
  }, upstreamResponse => {
    resolve({ upstreamRequest, upstreamResponse });
  });

  upstreamRequest.on('error', reject);
  upstreamRequest.write(payload);
  upstreamRequest.end();
});

// ============================================================================
// API Routes
// ============================================================================

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

/**
 * List all Cortex Agents
 * GET /api/agents
 */
app.get('/api/agents', async (req, res) => {
  try {
    const endpoint = `https://${SNOWFLAKE_CONFIG.host}/api/v2/databases/${SNOWFLAKE_CONFIG.database}/schemas/${SNOWFLAKE_CONFIG.schema}/agents`;
    
    console.log('📡 Fetching agents list from Snowflake...');
    
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: getSnowflakeAuthHeaders(),
    });

    if (!response.ok) {
      const contentType = response.headers.get('content-type') || '';
      
      // Build error message as array of parts (preserves structure better than string with \n\n)
      const errorParts = [
        ERROR_MESSAGES.ERROR_PREFIX,
        `${ERROR_MESSAGES.HTTP_ERROR_STATUS} ${response.status} ${response.statusText}`
      ];
      
      // For 400/401, skip error details (they're not helpful)
      // For 404 and others, include Snowflake's error details
      if (response.status !== HTTP_STATUS.BAD_REQUEST && response.status !== HTTP_STATUS.UNAUTHORIZED) {
        if (contentType.includes('application/json')) {
          try {
            const errorData = await response.json();
            const details = errorData.error || errorData.message || JSON.stringify(errorData, null, 2);
            errorParts.push(details);
          } catch {
            // JSON parsing failed, use default message
          }
        }
      }
      
      // Add helpful configuration hints based on status code
      if (response.status === HTTP_STATUS.BAD_REQUEST) {
        errorParts.push(ERROR_MESSAGES.TIPS.BAD_REQUEST);
      } else if (response.status === HTTP_STATUS.UNAUTHORIZED) {
        errorParts.push(ERROR_MESSAGES.TIPS.UNAUTHORIZED);
      } else if (response.status === HTTP_STATUS.NOT_FOUND) {
        errorParts.push(ERROR_MESSAGES.TIPS.NOT_FOUND);
      }
      
      console.error('❌ Snowflake API error:', response.status, errorParts.join('\n'));
      
      return res.status(response.status).json({
        errorParts  // Send as array instead of single string
      });
    }

    const data = await response.json();
    console.log(`✅ Successfully fetched ${Array.isArray(data) ? data.length : 'unknown'} agents`);
    
    res.json(data);
  } catch (error) {
    console.error('❌ Error fetching agents:', error.message);
    
    // Check if this is a network error (DNS, connection failed, etc.)
    if (error.cause?.code === 'ENOTFOUND' || error.message.includes('fetch failed') || error.cause?.code === 'ECONNREFUSED') {
      const errorParts = [
        ERROR_MESSAGES.ERROR_PREFIX,
        `${ERROR_MESSAGES.HTTP_ERROR_STATUS} ${HTTP_STATUS.SERVICE_UNAVAILABLE} Service Unavailable`,
        ERROR_MESSAGES.TIPS.SERVICE_UNAVAILABLE
      ];
      return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({ errorParts });
    }
    
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * Get details for a specific Cortex Agent
 * GET /api/agents/:agentName
 */
app.get('/api/agents/:agentName', async (req, res) => {
  try {
    const { agentName } = req.params;
    
    // Validate agent name to prevent injection
    if (!validateAgentName(agentName)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
        error: ERROR_MESSAGES.TIPS.INVALID_AGENT_NAME
      });
    }
    
    const endpoint = `https://${SNOWFLAKE_CONFIG.host}/api/v2/databases/${SNOWFLAKE_CONFIG.database}/schemas/${SNOWFLAKE_CONFIG.schema}/agents/${agentName}`;
    
    console.log(`📡 Fetching details for agent: ${agentName}...`);
    
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: getSnowflakeAuthHeaders(),
    });

    if (!response.ok) {
      const contentType = response.headers.get('content-type') || '';
      
      // Build error message as array of parts (preserves structure better than string with \n\n)
      const errorParts = [
        ERROR_MESSAGES.ERROR_PREFIX,
        `${ERROR_MESSAGES.HTTP_ERROR_STATUS} ${response.status} ${response.statusText}`
      ];
      
      // For 400/401, skip error details (they're not helpful)
      // For 404 and others, include Snowflake's error details
      if (response.status !== HTTP_STATUS.BAD_REQUEST && response.status !== HTTP_STATUS.UNAUTHORIZED) {
        if (contentType.includes('application/json')) {
          try {
            const errorData = await response.json();
            const details = errorData.error || errorData.message || JSON.stringify(errorData, null, 2);
            errorParts.push(details);
          } catch {
            // JSON parsing failed, use default message
          }
        }
      }
      
      // Add helpful configuration hints based on status code
      if (response.status === HTTP_STATUS.BAD_REQUEST) {
        errorParts.push(ERROR_MESSAGES.TIPS.BAD_REQUEST);
      } else if (response.status === HTTP_STATUS.UNAUTHORIZED) {
        errorParts.push(ERROR_MESSAGES.TIPS.UNAUTHORIZED);
      } else if (response.status === HTTP_STATUS.NOT_FOUND) {
        errorParts.push(ERROR_MESSAGES.TIPS.NOT_FOUND_AGENT(agentName));
      }
      
      console.error('❌ Snowflake API error:', response.status, errorParts.join('\n'));
      
      return res.status(response.status).json({
        errorParts  // Send as array instead of single string
      });
    }

    const data = await response.json();
    console.log(`✅ Successfully fetched details for agent: ${agentName}`);
    
    res.json(data);
  } catch (error) {
    console.error('❌ Error fetching agent details:', error.message);
    
    // Check if this is a network error (DNS, connection failed, etc.)
    if (error.cause?.code === 'ENOTFOUND' || error.message.includes('fetch failed') || error.cause?.code === 'ECONNREFUSED') {
      const errorParts = [
        ERROR_MESSAGES.ERROR_PREFIX,
        `${ERROR_MESSAGES.HTTP_ERROR_STATUS} ${HTTP_STATUS.SERVICE_UNAVAILABLE} Service Unavailable`,
        ERROR_MESSAGES.TIPS.SERVICE_UNAVAILABLE
      ];
      return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({ errorParts });
    }
    
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * Send message to Cortex Agent (streaming endpoint)
 * POST /api/agents/:agentName/messages
 */
app.post('/api/agents/:agentName/messages', async (req, res) => {
  try {
    const { agentName } = req.params;
    const requestBody = req.body;
    
    // Validate inputs
    if (!validateAgentName(agentName)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: ERROR_MESSAGES.TIPS.INVALID_AGENT_NAME });
    }
    
    // Validate request body has messages
    if (!requestBody.messages || !Array.isArray(requestBody.messages) || requestBody.messages.length === 0) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: ERROR_MESSAGES.TIPS.MESSAGES_REQUIRED });
    }

    console.log(`💬 Sending message to agent: ${agentName}`);
    
    // Build Snowflake agent messaging endpoint dynamically
    // Format: https://{host}/api/v2/databases/{db}/schemas/{schema}/agents/{agent}:run
    const agentEndpoint = `https://${SNOWFLAKE_CONFIG.host}/api/v2/databases/${SNOWFLAKE_CONFIG.database}/schemas/${SNOWFLAKE_CONFIG.schema}/agents/${agentName}:run`;
    
    // Make request to Snowflake Agent endpoint with HTTP/1.1 streaming.
    // Node fetch can use HTTP/2 here, which has intermittently ended with GOAWAY mid-stream.
    const { upstreamRequest, upstreamResponse } = await postSnowflakeAgentMessage(agentEndpoint, requestBody);
    const statusCode = upstreamResponse.statusCode || 500;
    const statusMessage = upstreamResponse.statusMessage || '';

    if (statusCode < 200 || statusCode >= 300) {
      const contentType = upstreamResponse.headers['content-type'] || '';
      
      // Build error message as array of parts (preserves structure better than string with \n\n)
      const errorParts = [
        ERROR_MESSAGES.ERROR_PREFIX,
        `${ERROR_MESSAGES.HTTP_ERROR_STATUS} ${statusCode} ${statusMessage}`
      ];
      
      // For 400/401, skip error details (they're not helpful)
      // For 404 and others, include Snowflake's error details
      if (statusCode !== HTTP_STATUS.BAD_REQUEST && statusCode !== HTTP_STATUS.UNAUTHORIZED) {
        if (contentType.includes('application/json')) {
          try {
            const errorData = JSON.parse(await collectStreamBody(upstreamResponse));
            const details = errorData.error || errorData.message || JSON.stringify(errorData, null, 2);
            errorParts.push(details);
          } catch {
            // JSON parsing failed, use default message
          }
        }
      }
      
      // Add helpful configuration hints based on status code and content type
      if (statusCode === 400) {
        errorParts.push('💡 Tip: Check your SNOWFLAKE_DATABASE and SNOWFLAKE_SCHEMA in the backend .env file. Make sure they exist and you have access to them.');
      } else if (statusCode === 401) {
        errorParts.push('💡 Tip: Check your SNOWFLAKE_PAT (Personal Access Token) in the backend .env file. Make sure it\'s valid and not expired.');
      } else if (statusCode === 404) {
        errorParts.push('💡 Tip: Check your SNOWFLAKE_HOST in the backend .env file. Make sure it\'s correct and accessible.');
      }
      
      console.error('❌ Snowflake Agent API error:', statusCode, errorParts.join('\n'));
      
      return res.status(statusCode).json({
        errorParts  // Send as array instead of single string
      });
    }

    // Check if response is streaming
    const contentType = upstreamResponse.headers['content-type'] || '';
    
    if (contentType.includes('text/event-stream') || contentType.includes('stream')) {
      // Set headers for SSE streaming
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // Disable buffering for nginx
      res.flushHeaders?.();
      
      console.log('📡 Streaming response from agent...');

      upstreamResponse.on('data', chunk => {
        if (!res.write(chunk)) {
          upstreamResponse.pause();
          res.once('drain', () => upstreamResponse.resume());
        }
      });

      upstreamResponse.on('end', () => {
        res.end();
        console.log('✅ Streaming complete');
      });

      upstreamResponse.on('error', error => {
        console.error('❌ Stream error:', error);
        if (!res.writableEnded) {
          writeSseEvent(res, 'response.error', {
            code: error.code || 'STREAM_INTERRUPTED',
            message: 'Snowflake stream was interrupted before completion. Please retry the question. If this continues, simplify the request or try again later.'
          });
          res.end();
        }
      });

      res.on('close', () => {
        if (!upstreamResponse.complete) {
          console.log('⚠️  Client disconnected');
          upstreamRequest.destroy();
        }
      });
    } else {
      // Non-streaming response
      const data = JSON.parse(await collectStreamBody(upstreamResponse));
      console.log('✅ Received non-streaming response from agent');
      res.json(data);
    }
  } catch (error) {
    console.error('❌ Error sending message to agent:', error.message);
    
    if (!res.headersSent) {
      // Check if this is a network error (DNS, connection failed, etc.)
      if (error.cause?.code === 'ENOTFOUND' || error.message.includes('fetch failed') || error.cause?.code === 'ECONNREFUSED') {
        const errorParts = [
          ERROR_MESSAGES.ERROR_PREFIX,
          'Failed to connect to Snowflake',
          '💡 Tip: Check your SNOWFLAKE_HOST in the backend .env file. Make sure it\'s correct and accessible (format: account.snowflakecomputing.com)'
        ];
        return res.status(503).json({ errorParts });
      }
      
      res.status(500).json({ error: sanitizeError(error) });
    }
  }
});

// Serve React static files in production
if (process.env.NODE_ENV === 'production') {
  const buildPath = path.join(__dirname, '../build');
  app.use(express.static(buildPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(buildPath, 'index.html'));
  });
} else {
  app.use((req, res) => {
    res.status(HTTP_STATUS.NOT_FOUND).json({
      error: 'Not found',
      message: 'The requested endpoint does not exist'
    });
  });
}

/**
 * Global error handler
 */
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err);
  res.status(500).json({ error: sanitizeError(err) });
});

// ============================================================================
// Server Startup
// ============================================================================

app.listen(PORT, () => {
  console.log('\n🚀 Secure Snowflake Proxy Server Started');
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📍 Server running on: http://localhost:${PORT}`);
  console.log(`🔒 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🏔️  Snowflake Host: ${SNOWFLAKE_CONFIG.host}`);
  console.log(`📊 Database: ${SNOWFLAKE_CONFIG.database}`);
  console.log(`📁 Schema: ${SNOWFLAKE_CONFIG.schema}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  console.log('Available endpoints:');
  console.log('  GET  /health                          - Health check');
  console.log('  GET  /api/agents                      - List all agents');
  console.log('  GET  /api/agents/:agentName           - Get agent details');
  console.log('  POST /api/agents/:agentName/messages  - Send message to agent');
  console.log('\n✨ Ready to accept requests!\n');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n🛑 SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n🛑 SIGINT received, shutting down gracefully...');
  process.exit(0);
});
