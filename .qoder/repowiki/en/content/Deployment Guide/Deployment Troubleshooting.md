# Deployment Troubleshooting

<cite>
**Referenced Files in This Document**
- [BUILD.md](file://doc/BUILD.md)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Project Structure](#project-structure)
3. [Core Components](#core-components)
4. [Architecture Overview](#architecture-overview)
5. [Detailed Component Analysis](#detailed-component-analysis)
6. [Dependency Analysis](#dependency-analysis)
7. [Performance Considerations](#performance-considerations)
8. [Troubleshooting Guide](#troubleshooting-guide)
9. [Conclusion](#conclusion)

## Introduction

This document provides comprehensive troubleshooting guidance for QuickLink deployment issues. QuickLink is a link collection tool built with React 18 + TypeScript + Vite (frontend), Node.js + Express + TypeScript (backend), and MongoDB 7 (database). The system uses Docker Compose for one-click deployment of frontend, backend, and MongoDB services.

The troubleshooting guide covers common deployment scenarios including Docker container connectivity problems, MongoDB connection failures, Express server startup issues, environment variable misconfigurations, permission issues, port conflicts, database migration failures, SSL certificate issues, CORS configuration problems, performance optimization, and maintenance procedures.

## Project Structure

QuickLink follows a monorepo structure with separate client and server directories:

```mermaid
graph TB
subgraph "QuickLink Project"
subgraph "Client (Frontend)"
ClientSrc["client/src/"]
ClientConfig["client/config files"]
end
subgraph "Server (Backend)"
ServerSrc["server/src/"]
ServerConfig["server/config files"]
Migrations["server/src/migrations/"]
end
subgraph "Infrastructure"
DockerCompose["docker-compose.yml"]
Dockerfiles["Dockerfile.client<br/>Dockerfile.server"]
EnvFile[".env.example"]
end
subgraph "Documentation"
BuildDoc["doc/BUILD.md"]
end
end
ClientSrc --> ServerSrc
ServerSrc --> Migrations
DockerCompose --> ClientSrc
DockerCompose --> ServerSrc
EnvFile --> ServerSrc
```

**Diagram sources**
- [BUILD.md:33-92](file://doc/BUILD.md#L33-L92)

**Section sources**
- [BUILD.md:33-92](file://doc/BUILD.md#L33-L92)

## Core Components

### Technology Stack Overview

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Frontend** | React 18 + TypeScript + Vite | SPA architecture with responsive design |
| **UI Framework** | Ant Design 5 | Component library with forms, tables, search |
| **Backend** | Node.js + Express + TypeScript | Lightweight REST API |
| **Database** | MongoDB 7 | NoSQL with flexible schema and aggregation queries |
| **Migration Tool** | migrate-mongo | Versioned database migrations |
| **Encryption** | AES-256-GCM + bcrypt | Secure data storage |
| **Authentication** | JWT (jsonwebtoken) | User session management |
| **Deployment** | Docker Compose | One-click service orchestration |

### Database Schema

The system manages four primary collections:

- **users**: User authentication and profile management
- **links**: Link collection with categorization and tagging
- **accounts**: Encrypted credential storage
- **tags**: Tag management for organization

**Section sources**
- [BUILD.md:96-178](file://doc/BUILD.md#L96-L178)

## Architecture Overview

QuickLink follows a three-tier architecture pattern:

```mermaid
sequenceDiagram
participant Browser as "Browser"
participant Client as "React Frontend"
participant Server as "Express Backend"
participant DB as "MongoDB"
Browser->>Client : HTTP Request
Client->>Server : API Call (/api/*)
Server->>Server : Authentication Check
Server->>DB : Database Query
DB-->>Server : Data Response
Server-->>Client : JSON Response
Client-->>Browser : Render UI
Note over Client,Server : CORS Configuration Required
Note over Server,DB : Connection String via Environment Variables
```

**Diagram sources**
- [BUILD.md:285-336](file://doc/BUILD.md#L285-L336)
- [BUILD.md:394-416](file://doc/BUILD.md#L394-L416)

## Detailed Component Analysis

### Docker Container Architecture

The deployment uses Docker Compose to orchestrate three main services:

```mermaid
graph LR
subgraph "Docker Services"
MongoDB["MongoDB Service<br/>Port: 27017"]
Server["Express Server<br/>Port: 3000"]
Client["React Client<br/>Port: 5173"]
end
subgraph "Data Persistence"
Volume["MongoDB Volume<br/>mongo_data"]
end
Client --> Server
Server --> MongoDB
MongoDB --> Volume
```

**Diagram sources**
- [BUILD.md:418-459](file://doc/BUILD.md#L418-L459)

### Environment Configuration

Critical environment variables include:

- **Server Configuration**: PORT, NODE_ENV
- **Database Connection**: MONGODB_URI, MONGODB_DB_NAME
- **Security**: JWT_SECRET, JWT_EXPIRES_IN, ENCRYPTION_SALT
- **Client Integration**: VITE_API_BASE_URL

**Section sources**
- [BUILD.md:394-416](file://doc/BUILD.md#L394-L416)

### Database Migration System

QuickLink uses migrate-mongo for versioned database schema changes:

```mermaid
flowchart TD
Start([Migration Process]) --> CheckStatus["Check Migration Status"]
CheckStatus --> HasPending{"Pending Migrations?"}
HasPending --> |Yes| ApplyMigrations["Apply Pending Migrations"]
HasPending --> |No| Complete["Migration Complete"]
ApplyMigrations --> ValidateSchema["Validate Schema Changes"]
ValidateSchema --> UpdateChangelog["Update Migration Changelog"]
UpdateChangelog --> Complete
Complete --> End([Process Complete])
```

**Diagram sources**
- [BUILD.md:201-282](file://doc/BUILD.md#L201-L282)

## Dependency Analysis

### Service Dependencies

```mermaid
graph TD
Client["React Client"] --> |API Calls| Server["Express Server"]
Server --> |Connection| MongoDB["MongoDB"]
Server --> |Auth| JWT["JWT Library"]
Server --> |Encryption| Crypto["AES-256-GCM"]
Server --> |Validation| Validator["express-validator"]
Server --> |Rate Limiting| RateLimit["express-rate-limit"]
Server --> |CORS| CORS["cors middleware"]
Server --> |Security| Helmet["helmet"]
```

**Diagram sources**
- [BUILD.md:542-568](file://doc/BUILD.md#L542-L568)

### External Dependencies

Key external dependencies include:
- **Database Driver**: mongoose for MongoDB connection
- **Authentication**: jsonwebtoken for JWT handling
- **Security**: bcrypt for password hashing, helmet for security headers
- **Validation**: express-validator for input validation
- **Rate Limiting**: express-rate-limit for API protection
- **CORS**: cors middleware for cross-origin requests

**Section sources**
- [BUILD.md:542-568](file://doc/BUILD.md#L542-L568)

## Performance Considerations

### Database Optimization

QuickLink implements several database optimization strategies:

- **Index Strategy**: Strategic indexing on frequently queried fields
- **Text Search**: Full-text search capabilities for links
- **Aggregation Queries**: Complex data processing using MongoDB aggregations
- **Connection Pooling**: Efficient database connection management

### Security and Performance Balance

The system balances security with performance through:
- **Selective Encryption**: Only sensitive fields are encrypted
- **Efficient Caching**: Application-level caching for frequently accessed data
- **Connection Management**: Optimized database connection pooling
- **Request Validation**: Early input validation to prevent unnecessary processing

## Troubleshooting Guide

### Docker Container Connectivity Issues

#### Common Symptoms
- Containers failing to start
- Network communication between containers blocked
- Port mapping conflicts

#### Diagnostic Commands

```bash
# Check container status
docker ps -a

# View container logs
docker logs quicklink-server
docker logs quicklink-mongodb
docker logs quicklink-client

# Test network connectivity
docker exec quicklink-server ping mongodb
docker exec quicklink-client curl http://server:3000/api/health

# Check port bindings
docker port quicklink-server
docker port quicklink-mongodb
```

#### Resolution Steps

1. **Verify Docker Compose Configuration**: Ensure all services are properly defined
2. **Check Port Conflicts**: Use `netstat -tulpn` to identify conflicting ports
3. **Network Testing**: Test inter-container communication using docker exec
4. **Volume Permissions**: Verify MongoDB volume has correct permissions

**Section sources**
- [BUILD.md:418-459](file://doc/BUILD.md#L418-L459)

### MongoDB Connection Failures

#### Common Error Messages
- "MongoServerError: connect ECONNREFUSED"
- "Authentication failed"
- "Maximum number of connections exceeded"

#### Diagnostic Approach

1. **Service Health Check**:
   ```bash
   docker exec quicklink-mongodb mongosh --eval "db.adminCommand('ping')"
   ```

2. **Connection String Validation**:
   - Verify MONGODB_URI format: `mongodb://username:password@host:port/database`
   - Check if MongoDB service is reachable from server container

3. **Database Access Verification**:
   ```bash
   docker exec -it quicklink-mongodb mongosh quicklink
   ```

#### Solutions

- **Restart MongoDB Service**: `docker restart quicklink-mongodb`
- **Reset Database**: Remove volume and recreate (`docker-compose down -v && docker-compose up`)
- **Authentication Issues**: Verify username/password in connection string
- **Connection Limits**: Increase maxConnections in MongoDB config if needed

**Section sources**
- [BUILD.md:394-416](file://doc/BUILD.md#L394-L416)

### Express Server Startup Issues

#### Common Symptoms
- Server fails to bind to port
- Missing environment variables
- Module loading errors

#### Diagnostic Steps

1. **Check Server Logs**:
   ```bash
   docker logs quicklink-server --tail 100
   ```

2. **Environment Variable Validation**:
   ```bash
   docker exec quicklink-server env | grep -E "(PORT|MONGODB_|JWT_|ENCRYPTION_)"
   ```

3. **Port Availability**:
   ```bash
   docker exec quicklink-server netstat -tlnp | grep :3000
   ```

#### Resolution Strategies

- **Missing Dependencies**: Rebuild server image with `docker-compose build server`
- **Environment Variables**: Verify .env file exists and is properly formatted
- **Port Conflicts**: Change PORT in environment or stop conflicting processes
- **Memory Issues**: Increase Docker memory limits if server crashes during startup

**Section sources**
- [BUILD.md:394-416](file://doc/BUILD.md#L394-L416)

### Environment Variable Misconfigurations

#### Critical Variables to Verify

| Variable | Purpose | Common Issues |
|----------|---------|---------------|
| MONGODB_URI | Database connection | Incorrect hostname, missing credentials |
| MONGODB_DB_NAME | Database selection | Typo in database name |
| JWT_SECRET | Authentication signing | Too short, not secure |
| PORT | Server binding | Port already in use |
| VITE_API_BASE_URL | Frontend API endpoint | Wrong URL format |

#### Debugging Techniques

1. **List All Environment Variables**:
   ```bash
   docker exec quicklink-server env
   ```

2. **Test Specific Variables**:
   ```bash
   docker exec quicklink-server echo $MONGODB_URI
   ```

3. **Validate Configuration**:
   Create a health check endpoint that reports current configuration state

#### Best Practices

- Use `.env.example` as template for production environments
- Implement configuration validation at application startup
- Log configuration errors without exposing sensitive values
- Use different .env files for development, staging, and production

**Section sources**
- [BUILD.md:394-416](file://doc/BUILD.md#L394-L416)

### Permission Issues

#### Common Scenarios

- MongoDB data directory permissions
- File upload directory access
- Certificate file reading permissions
- Log file writing permissions

#### Diagnostic Commands

```bash
# Check file permissions in container
docker exec quicklink-server ls -la /path/to/file

# Check MongoDB data directory
docker exec quicklink-mongodb ls -la /data/db

# Check user context
docker exec quicklink-server whoami
```

#### Solutions

- Set proper ownership: `chown -R node:node /app`
- Configure umask for file creation
- Use Docker volumes with proper permissions
- Run containers with appropriate user privileges

### Port Conflicts

#### Identification Methods

```bash
# Find process using specific port
lsof -i :3000
netstat -tulpn | grep :3000

# Check all Docker port mappings
docker port <container_name>
```

#### Resolution Strategies

1. **Change Port Mapping**: Modify docker-compose.yml port mappings
2. **Kill Conflicting Process**: Stop the process using the port
3. **Use Dynamic Ports**: Configure applications to use available ports
4. **Container Isolation**: Ensure each service uses unique ports

### Database Migration Failures

#### Common Error Types

- **Connection Errors**: Cannot connect to MongoDB
- **Schema Validation**: Invalid migration script syntax
- **Permission Denied**: Insufficient database privileges
- **Lock Contention**: Multiple migration processes running

#### Diagnostic Approach

1. **Check Migration Status**:
   ```bash
   docker exec quicklink-server npx migrate-mongo status
   ```

2. **Review Migration Logs**:
   ```bash
   docker logs quicklink-server | grep -i migration
   ```

3. **Test Database Connection**:
   ```bash
   docker exec quicklink-server npx migrate-mongo test
   ```

#### Recovery Procedures

- **Rollback Failed Migration**: `npx migrate-mongo down`
- **Reset Migration State**: Clear migrations collection and reapply
- **Manual Intervention**: Directly modify database schema if necessary
- **Backup Before Migration**: Always backup database before applying migrations

**Section sources**
- [BUILD.md:201-282](file://doc/BUILD.md#L201-L282)

### SSL Certificate Issues

#### Common Problems

- Self-signed certificate warnings
- Certificate chain validation failures
- Expired certificates
- Incorrect domain mapping

#### Diagnostic Tools

```bash
# Check certificate details
openssl s_client -connect yourdomain.com:443 -showcerts

# Test HTTPS connectivity
curl -I https://yourdomain.com

# Verify certificate expiration
openssl x509 -in certificate.pem -noout -dates
```

#### Solutions

- Install complete certificate chain
- Configure proper domain-to-certificate mapping
- Set up automatic certificate renewal
- Use reverse proxy (Nginx/Apache) for SSL termination

### CORS Configuration Problems

#### Symptom Analysis

- Browser console shows CORS errors
- API calls fail from different domains
- Preflight requests not handled

#### Configuration Checklist

1. **Origin Whitelist**: Configure allowed origins in CORS settings
2. **Methods and Headers**: Allow required HTTP methods and headers
3. **Credentials**: Enable credentials if needed for authentication
4. **Development vs Production**: Different CORS policies per environment

#### Testing CORS Configuration

```bash
# Test preflight request
curl -X OPTIONS -H "Origin: http://localhost:5173" \
     -H "Access-Control-Request-Method: GET" \
     http://localhost:3000/api/health

# Test actual request with credentials
curl -X GET -H "Origin: http://localhost:5173" \
     -H "Authorization: Bearer token" \
     http://localhost:3000/api/links
```

**Section sources**
- [BUILD.md:380-391](file://doc/BUILD.md#L380-L391)

## Performance Considerations

### Memory Usage Analysis

#### Monitoring Techniques

```bash
# Monitor container memory usage
docker stats quicklink-server

# Check process memory inside container
docker exec quicklink-server top -b -n 1 | head -20

# Analyze Node.js heap usage
docker exec quicklink-server node -e "console.log(process.memoryUsage())"
```

#### Optimization Strategies

- **Node.js Memory Limits**: Configure `--max-old-space-size` flag
- **Database Query Optimization**: Use efficient queries and proper indexing
- **Connection Pooling**: Optimize database and external service connections
- **Caching Implementation**: Implement application-level caching for frequent operations

### Database Query Optimization

#### Performance Indicators

- Slow query detection using MongoDB profiler
- Index usage analysis with explain()
- Connection pool utilization monitoring

#### Optimization Techniques

- **Query Profiling**: Identify slow queries using MongoDB profiler
- **Index Optimization**: Add composite indexes for complex queries
- **Query Restructuring**: Optimize aggregation pipelines
- **Connection Management**: Tune connection pool sizes

### API Response Time Monitoring

#### Monitoring Setup

```bash
# Monitor API response times
docker exec quicklink-server ab -n 100 -c 10 http://localhost:3000/api/links

# Check server metrics
docker exec quicklink-server node -e "console.log(process.uptime())"
```

#### Performance Metrics to Track

- Average response time per endpoint
- P95 and P99 latency percentiles
- Error rates and timeout occurrences
- Database query execution times

### Maintenance Procedures

#### Log Rotation

```bash
# Configure log rotation for Docker containers
docker run --log-driver=json-file --log-opt max-size=10m --log-opt max-file=3

# Clean old logs
find /var/lib/docker/containers -name "*.json" -mtime +7 -delete
```

#### Disk Space Management

```bash
# Check disk usage
docker system df
docker volume ls -f dangling=true

# Clean unused resources
docker system prune -a
docker volume prune
```

#### System Updates

```bash
# Update Docker images
docker-compose pull
docker-compose up -d

# Backup database before updates
docker exec quicklink-mongodb mongodump --out=/backup

# Rollback procedure
docker-compose down
docker-compose up -d <previous_version>
```

**Section sources**
- [BUILD.md:498-505](file://doc/BUILD.md#L498-L505)

## Conclusion

Effective troubleshooting of QuickLink deployments requires systematic approaches to diagnosing issues across all layers of the stack. By understanding the Docker-based architecture, environment configuration requirements, and service dependencies, administrators can quickly identify and resolve common deployment problems.

The key to successful troubleshooting lies in:

1. **Systematic Investigation**: Start with container status, then move to logs, then to specific service diagnostics
2. **Environment Validation**: Ensure all environment variables are correctly configured
3. **Network Testing**: Verify inter-service communication and external connectivity
4. **Performance Monitoring**: Proactively monitor system resources and application performance
5. **Regular Maintenance**: Implement automated maintenance procedures for logs, backups, and updates

By following the diagnostic procedures and solutions outlined in this guide, deployment teams can maintain reliable QuickLink installations with minimal downtime and optimal performance.