# Snowpark Container Services (SPCS) Deploy Guide

If you'd like to deploy this app to Snowpark Container Services in your account, follow the instructions outlined below.

## Prerequisites

- App must be working locally as per [README.md](../README.md)
- Docker installed
- SnowCLI configured to connect to your account
    - Or, you may also execute the .sql files in Snowsight

    **NOTE**: If you're using SnowCLI, remember to replace `your-snowcli-connection-name` in commands below with your connection name.

## Demo

https://github.com/user-attachments/assets/ec175c62-25ec-49bf-bd1f-299a0eea7188

## Steps

### Step 1: Setup Snowflake

```bash
snow sql -c your-snowcli-connection-name -f spcs/spcs-setup.sql
```

**NOTE**: Save/copy the image repository URL from the output. You'll need it in Step 2.

### Step 2: Build & Push Docker Image

```bash
# Set your repo URL from Step 1
export REPO_URL="<your-image-repository-url>"
```

```bash
# Build Project
REACT_APP_BACKEND_URL="" NODE_OPTIONS="--max-old-space-size=4096" npm run build
```

```bash
# Build Docker Image
docker build --platform linux/amd64 -t dash:latest -f Dockerfile .
```

```bash
# Tag Docker Image
docker tag dash:latest ${REPO_URL}/dash:latest
```

```bash
# Docker Login
docker login ${REPO_URL}  -u <your-username> # For password, I used the SNOWFLAKE_PAT from .env
```

```bash
# Push Docker Image to Snowflake
docker push ${REPO_URL}/dash:latest
```

### Step 3: Configure SPCS Service Spec

* Make a copy of `spcs/spec.yaml.example` and name it `spcs/spec.yaml`
* Edit `spcs/spec.yaml` and update these values:

    ```yaml
    SNOWFLAKE_HOST: "your-account.snowflakecomputing.com"
    SNOWFLAKE_PAT: "your_pat_token"
    SNOWFLAKE_DATABASE: "YOUR_DATABASE"
    SNOWFLAKE_SCHEMA: "YOUR_SCHEMA"
    ```

### Step 4: Upload SPCS Service Spec

```bash
# Upload SPCS spec
snow stage copy spcs/spec.yaml @DASH_SPCS.APPS.SPECS --overwrite -c your-snowcli-connection-name
```

### Step 5: Create SPCS Service

```bash
# Create SPCS service
snow sql -c your-snowcli-connection-name -f spcs/spcs-create-service.sql
```

### Step 6: Get Your APP URL

```bash
snow sql -c your-snowcli-connection-name -q "USE DASH_SPCS.APPS; SHOW ENDPOINTS IN SERVICE DASH_SERVICE;"
```

Look for and copy `ingress_url` - that's your app!

### Step 7: Launch Application

Open `ingress_url` (from Step 6) in a browser window to login and access the app. It should look and behave exactly like it does when you run it locally.

## Future Code Edits

```bash
# Rebuild Project
REACT_APP_BACKEND_URL="" NODE_OPTIONS="--max-old-space-size=4096" npm run build
```

```bash
# Rebuild Docker Image
docker build --platform linux/amd64 -t dash:latest -f Dockerfile .
```

```bash
# Tag Docker Image
docker tag dash:latest ${REPO_URL}/dash:latest
```

```bash
# Push Docker Image to Snowflake
docker push ${REPO_URL}/dash:latest
```

### Update service (retains the same app URL)

```bash
snow sql -c your-snowcli-connection-name  -f spcs-update.sql
```

## Common Issues

**Build fails with memory error?**
- Increase memory: `NODE_OPTIONS="--max-old-space-size=8192"`

**"exec format error"?**
- Missing `--platform linux/amd64` flag in docker build

**CORS errors?**
- Check `ALLOWED_ORIGINS: "*"` is in spec.yaml

**Can't see logs?**
```bash
snow sql -c your-snowcli-connection-name -q "USE DASH_SPCS.APPS; CALL SYSTEM\$GET_SERVICE_LOGS('DASH_SERVICE', '0', 'dash', 100);"
```


