-- ============================================================================
-- SPCS Service Update (Retains Endpoint URL)
-- ============================================================================
-- Execute this file AFTER:
--   1. Building and pushing new Docker image
--   2. Uploading updated spec.yaml (if changed)
--
-- Execute using SnowCli:
--   snow sql -c your-snowcli-connection-name -f spcs-update.sql
--
-- This approach RETAINS the original endpoint URL (unlike DROP/CREATE)
-- ============================================================================

USE DATABASE DASH_SPCS;
USE SCHEMA APPS;

-- Suspend the service
ALTER SERVICE DASH_SERVICE SUSPEND;

-- Update service with new/same spec/image
ALTER SERVICE DASH_SERVICE FROM @SPECS SPECIFICATION_FILE = 'spec.yaml';

-- Resume the service
ALTER SERVICE DASH_SERVICE RESUME;

-- Wait a moment for service to start
CALL SYSTEM$WAIT(5);

-- Check service status
DESCRIBE SERVICE DASH_SERVICE;

-- View service endpoints (should be the same as before)
SHOW ENDPOINTS IN SERVICE DASH_SERVICE;
