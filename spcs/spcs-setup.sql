-- ============================================================================
-- SPCS Initial Setup
-- ============================================================================
-- Execute this file using SnowCli:
--   snow sql -c your-snowcli-connection-name -f spcs-setup.sql
--
-- Or in parts:
--   snow sql -c your-snowcli-connection-name -q "$(cat spcs-setup.sql)"
-- ============================================================================

SET CURRENT_ROLE_NAME = CURRENT_ROLE();

-- Step 1: Create database and schema
CREATE DATABASE IF NOT EXISTS DASH_SPCS
  COMMENT = 'Database for Dash DesAI Snowpark Container Services';

USE DATABASE DASH_SPCS;

CREATE SCHEMA IF NOT EXISTS APPS
  COMMENT = 'Schema for Dash DesAI application objects';

USE SCHEMA APPS;

-- Step 2: Create image repository
CREATE IMAGE REPOSITORY IF NOT EXISTS DASH_REPO
  COMMENT = 'Repository for Dash DesAI Docker images';

-- Show repository URL (you'll need this for docker push)
SHOW IMAGE REPOSITORIES IN SCHEMA;

-- Step 3: Create compute pool
CREATE COMPUTE POOL IF NOT EXISTS DASH_POOL
  MIN_NODES = 1
  MAX_NODES = 3
  INSTANCE_FAMILY = CPU_X64_XS
  AUTO_RESUME = TRUE
  AUTO_SUSPEND_SECS = 3600
  COMMENT = 'Compute pool for Dash DesAI service';

-- Check compute pool status (should be ACTIVE or IDLE)
DESCRIBE COMPUTE POOL DASH_POOL;

-- Step 4: Create stage for service specifications
CREATE STAGE IF NOT EXISTS SPECS
  ENCRYPTION = (TYPE = 'SNOWFLAKE_SSE')
  COMMENT = 'Stage for storing service specification files';

-- List contents of stage (will be empty initially)
LIST @SPECS;

-- Step 5: Create network rule for external access
-- This allows the container to make outbound HTTPS/HTTP requests
CREATE NETWORK RULE IF NOT EXISTS ALLOW_ALL_RULE
  TYPE = 'HOST_PORT'
  MODE = 'EGRESS'
  VALUE_LIST = ('0.0.0.0:443', '0.0.0.0:80')
  COMMENT = 'Allow outbound HTTP/HTTPS traffic';

-- Step 6: Create external access integration
CREATE EXTERNAL ACCESS INTEGRATION IF NOT EXISTS ALLOW_ALL_INTEGRATION
  ALLOWED_NETWORK_RULES = (ALLOW_ALL_RULE)
  ENABLED = TRUE
  COMMENT = 'External access integration for Dash DesAI';

-- Grant basic privileges to current role
GRANT USAGE ON DATABASE DASH_SPCS TO ROLE IDENTIFIER($CURRENT_ROLE_NAME);
GRANT USAGE ON SCHEMA DASH_SPCS.APPS TO ROLE IDENTIFIER($CURRENT_ROLE_NAME);
GRANT READ ON STAGE DASH_SPCS.APPS.SPECS TO ROLE IDENTIFIER($CURRENT_ROLE_NAME);
GRANT WRITE ON STAGE DASH_SPCS.APPS.SPECS TO ROLE IDENTIFIER($CURRENT_ROLE_NAME);
GRANT USAGE ON COMPUTE POOL DASH_POOL TO ROLE IDENTIFIER($CURRENT_ROLE_NAME);
GRANT MONITOR ON COMPUTE POOL DASH_POOL TO ROLE IDENTIFIER($CURRENT_ROLE_NAME);

-- Verify setup

-- Show compute pools
SHOW COMPUTE POOLS LIKE 'DASH_POOL';

-- Get compute pool status
DESCRIBE COMPUTE POOL DASH_POOL;

-- Show stages
SHOW STAGES IN SCHEMA DASH_SPCS.APPS;

-- Show image repositories
SHOW IMAGE REPOSITORIES IN SCHEMA DASH_SPCS.APPS;

SELECT "repository_url" AS "IMP: SAVE/COPY THIS REPOSITORY URL" 
FROM TABLE(RESULT_SCAN(LAST_QUERY_ID()));
