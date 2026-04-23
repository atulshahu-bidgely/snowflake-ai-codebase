-- ============================================================================
-- SPCS Create Service
-- ============================================================================
-- Execute this file using SnowCli:
--   snow sql -c your-snowcli-connection-name -f spcs-create-service.sql
--
-- Or in parts:
--   snow sql -c your-snowcli-connection-name -q "$(cat spcs-create-service.sql)"
-- ============================================================================

USE DATABASE DASH_SPCS;
USE SCHEMA APPS;

-- Check if spec.yaml exists in stage
LIST @SPECS;

-- Check if Docker image exists in repository
SHOW IMAGES IN IMAGE REPOSITORY DASH_REPO;

-- Create the service
CREATE SERVICE IF NOT EXISTS DASH_SERVICE
  IN COMPUTE POOL DASH_POOL
  FROM @SPECS
  SPECIFICATION_FILE = 'spec.yaml'
  MIN_INSTANCES = 1
  MAX_INSTANCES = 3
  EXTERNAL_ACCESS_INTEGRATIONS = (ALLOW_ALL_INTEGRATION)
  COMMENT = 'Dash DesAI - Snowflake Cortex Agents Chat Interface';

-- Wait a moment for service to initialize
CALL SYSTEM$WAIT(5);

-- Check service status
DESCRIBE SERVICE DASH_SERVICE;

-- View service logs (last 100 lines)
CALL SYSTEM$GET_SERVICE_LOGS('DASH_SERVICE', '0', 'dash', 100);

-- View service endpoints
SHOW ENDPOINTS IN SERVICE DASH_SERVICE;


