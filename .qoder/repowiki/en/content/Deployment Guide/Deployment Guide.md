# Deployment Guide

<cite>
**Referenced Files in This Document**
- [BUILD.md](file://doc/BUILD.md)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Project Structure](#project-structure)
3. [Core Components](#core-components)
4. [Architecture Overview](#architecture-overview)
5. [Docker Compose Deployment](#docker-compose-deployment)
6. [Environment Configuration](#environment-configuration)
7. [Nginx Reverse Proxy Setup](#nginx-reverse-proxy-setup)
8. [Monitoring and Logging](#monitoring-and-logging)
9. [Backup and Recovery](#backup-and-recovery)
10. [Security Hardening](#security-hardening)
11. [Performance Optimization](#performance-optimization)
12. [Troubleshooting Guide](#troubleshooting-guide)
13. [Maintenance Procedures](#maintenance-procedures)
14. [Scaling Considerations](#scaling-considerations)
15. [Conclusion](#conclusion)

## Introduction

QuickLink is a comprehensive link bookmarking and credential management tool designed for personal knowledge management. The application provides secure storage for web links with categorization and tagging capabilities, along with encrypted password management for various platforms. Built with modern technologies including React 18, Node.js Express, and MongoDB, QuickLink offers a production-ready solution for managing digital assets securely.

The system supports advanced features such as full-text search, data import/export, schema migrations, and AES-256-GCM encryption for sensitive data storage. With Docker Compose support, QuickLink can be deployed efficiently across development and production environments.

## Project Structure

QuickLink follows a monorepo structure with clear separation between frontend and backend components:

```
quick_link/
├── doc/                        # Documentation
│   └── BUILD.md               # Build and deployment guide
├── client/                     # React frontend application
│   ├── src/
│   │   ├── components/        # Reusable UI components
│   │   ├── pages/             # Page-level components
│   │   ├── services/          # API service layer
│   │   ├── stores/            # State management (Zustand)
│   │   ├── hooks/             # Custom React hooks
│   │   ├── utils/             # Utility functions
│   │   ├── types/             # TypeScript definitions
│   │   ├── App.tsx            # Main application component
│   │   └── main.tsx           # Application entry point
│   ├── vite.config.ts         # Vite configuration
│   ├── tsconfig.json          # TypeScript configuration
│   └── package.json           # Frontend dependencies
├── server/                     # Node.js backend API
│   ├── src/
│   │   ├── config/            # Configuration files
│   │   ├── controllers/       # Request handlers
│   │   ├── models/            # Mongoose schemas
│   │   ├── routes/            # API route definitions
│   │   ├── middleware/        # Authentication & error handling
│   │   ├── services/          # Business logic
│   │   ├── migrations/        # Database migration scripts
│   │   ├── utils/             # Helper functions
│   │   └── app.ts             # Express application entry
│   ├── tsconfig.json          # TypeScript configuration
│   └── package.json           # Backend dependencies
├── docker-compose.yml         # Container orchestration
├── Dockerfile.client          # Frontend container image
├── Dockerfile.server          # Backend container image
├── .env.example              # Environment variables template
└── .gitignore                # Git ignore rules
```

**Section sources**
- [BUILD.md:33-92](file://doc/BUILD.md#L33-L92)

## Core Components

### Backend Architecture
The server component is built with Node.js and Express, providing a RESTful API with TypeScript support. Key architectural elements include:

- **Authentication**: JWT-based authentication with bcrypt password hashing
- **Database**: MongoDB with Mongoose ODM and schema migrations
- **Security**: AES-256-GCM encryption for sensitive data, rate limiting, and input validation
- **API Layer**: Modular controller architecture with service layer abstraction

### Frontend Architecture
The client application uses React 18 with TypeScript and Vite for fast development and building:

- **State Management**: Zustand for lightweight state management
- **UI Framework**: Ant Design 5 for consistent user interface components
- **Build Tool**: Vite for optimized development and production builds
- **Routing**: React Router for client-side navigation

### Database Schema
QuickLink implements a well-structured MongoDB schema with four primary collections:

- **Users**: User accounts with encrypted master keys
- **Links**: Bookmark entries with metadata and relationships
- **Accounts**: Encrypted credential storage with platform associations
- **Tags**: Categorization system for organizing content

**Section sources**
- [BUILD.md:96-198](file://doc/BUILD.md#L96-L198)
- [BUILD.md:285-337](file://doc/BUILD.md#L285-L337)

## Architecture Overview

The QuickLink system follows a three-tier architecture pattern with clear separation of concerns:

```mermaid
graph TB
subgraph "Client Tier"
Browser[Web Browser]
ReactApp[React SPA]
Vite[Vite Dev Server]
end
subgraph "Application Tier"
Nginx[Nginx Reverse Proxy]
Express[Express API Server]
Auth[JWT Authentication]
Services[Business Logic Services]
end
subgraph "Data Tier"
MongoDB[MongoDB Database]
Redis[Redis Cache]
Storage[File Storage]
end
Browser --> Nginx
Nginx --> ReactApp
Nginx --> Express
Express --> Auth
Express --> Services
Services --> MongoDB
Services --> Redis
Services --> Storage
```

**Diagram sources**
- [BUILD.md:394-459](file://doc/BUILD.md#L394-L459)

The architecture ensures scalability, maintainability, and security through proper separation of responsibilities and standardized communication patterns between components.

## Docker Compose Deployment

QuickLink provides a production-ready Docker Compose configuration that orchestrates all necessary services:

### Service Architecture

The deployment includes three primary services:

1. **MongoDB Service**: Database instance with persistent volume storage
2. **Server Service**: Node.js Express API backend
3. **Client Service**: Static React application served by Nginx

### Volume Management

Data persistence is handled through Docker volumes:

- **mongo_data**: Persistent storage for MongoDB database files
- **Config volumes**: Externalized configuration files for environment-specific settings

### Container Orchestration

The Docker Compose configuration manages service dependencies, networking, and resource allocation:

```mermaid
sequenceDiagram
participant User as User
participant Nginx as Nginx Client
participant Express as Express Server
participant Mongo as MongoDB
User->>Nginx : HTTP Request
Nginx->>Express : Forward API Request
Express->>Mongo : Database Query
Mongo-->>Express : Data Response
Express-->>Nginx : JSON Response
Nginx-->>User : HTML/JSON Response
```

**Diagram sources**
- [BUILD.md:418-459](file://doc/BUILD.md#L418-L459)

### Health Checks and Dependencies

Services are configured with proper dependency management:

- Server depends on MongoDB availability
- Client depends on server connectivity
- Graceful startup sequencing ensures service readiness

**Section sources**
- [BUILD.md:418-459](file://doc/BUILD.md#L418-L459)

## Environment Configuration

Production deployments require careful configuration of environment variables to ensure security and proper functionality:

### Critical Environment Variables

#### Server Configuration
- **PORT**: Application server port (default: 3000)
- **NODE_ENV**: Runtime environment (production/development)
- **MONGODB_URI**: MongoDB connection string with authentication
- **MONGODB_DB_NAME**: Target database name

#### Security Configuration
- **JWT_SECRET**: Strong secret key for JWT token signing
- **JWT_EXPIRES_IN**: Token expiration time (recommended: 2h)
- **ENCRYPTION_SALT**: Salt value for AES-256-GCM encryption

#### Client Configuration
- **VITE_API_BASE_URL**: Backend API endpoint URL

### Production Security Best Practices

1. **JWT Secret Management**: Use cryptographically secure random strings with minimum 32 characters
2. **Encryption Salt**: Generate unique salt values for each deployment using secure random generators
3. **Database Credentials**: Use separate database users with minimal required privileges
4. **CORS Configuration**: Restrict allowed origins to specific domains in production
5. **Rate Limiting**: Configure appropriate limits to prevent abuse

### Environment-Specific Configurations

| Environment | PORT | NODE_ENV | CORS Settings | Debug Mode |
|-------------|------|----------|---------------|------------|
| Development | 3000 | development | All origins | Enabled |
| Staging | 3000 | staging | Specific domains | Limited |
| Production | 80/443 | production | Strict whitelist | Disabled |

**Section sources**
- [BUILD.md:394-417](file://doc/BUILD.md#L394-L417)

## Nginx Reverse Proxy Setup

Nginx serves as the reverse proxy and static asset server for the QuickLink application:

### HTTPS Termination

Configure Nginx to handle SSL/TLS termination:

- **SSL Certificates**: Use Let's Encrypt or commercial certificates
- **Protocol Support**: Enable TLS 1.2+ with modern cipher suites
- **HTTP to HTTPS Redirect**: Automatic redirect for security compliance

### Static Asset Serving

Optimize static content delivery:

- **Compression**: Enable gzip/brotli compression for text assets
- **Caching**: Configure appropriate cache headers for static resources
- **CDN Integration**: Optional CDN configuration for global distribution

### API Routing

Route management for different service endpoints:

```mermaid
flowchart TD
Client[Client Request] --> Nginx[Nginx]
Nginx --> |/api/*| Express[Express API]
Nginx --> |/*| React[Static React App]
Express --> MongoDB[MongoDB]
```

**Diagram sources**
- [BUILD.md:498-504](file://doc/BUILD.md#L498-L504)

### Performance Optimization

- **Connection Pooling**: Configure keep-alive connections
- **Buffer Sizes**: Optimize buffer sizes for large requests/responses
- **Load Balancing**: Multi-instance support for high availability

**Section sources**
- [BUILD.md:498-504](file://doc/BUILD.md#L498-L504)

## Monitoring and Logging

### Application Logging

Implement structured logging throughout the application stack:

- **Log Levels**: DEBUG, INFO, WARN, ERROR with appropriate filtering
- **Log Format**: JSON format for centralized log aggregation
- **Sensitive Data**: Mask passwords, tokens, and other sensitive information

### Health Check Endpoints

Expose health monitoring endpoints for container orchestration:

- **/health**: Basic service health status
- **/health/db**: Database connectivity check
- **/health/external**: External service dependency checks

### Metrics Collection

Monitor application performance and usage:

- **Request Metrics**: Request rates, response times, error rates
- **Resource Usage**: CPU, memory, and disk utilization
- **Business Metrics**: User activity, data growth, feature usage

### Log Aggregation

Centralize logs for analysis and troubleshooting:

- **ELK Stack**: Elasticsearch, Logstash, Kibana for log management
- **Cloud Solutions**: AWS CloudWatch, Google Cloud Logging
- **Real-time Monitoring**: Alerting on critical errors and performance issues

**Section sources**
- [BUILD.md:380-391](file://doc/BUILD.md#L380-L391)

## Backup and Recovery

### MongoDB Data Backup

Implement automated backup strategies for data protection:

#### Automated Backups
- **Scheduled Snapshots**: Daily incremental backups with weekly full backups
- **Off-site Storage**: Store backups in cloud storage (AWS S3, Google Cloud Storage)
- **Retention Policy**: Maintain backups for 30-90 days based on compliance requirements

#### Manual Backup Procedures
```bash
# MongoDB dump command
mongodump --uri=mongodb://user:pass@host:port/dbname --out=/backup/path

# Restore from backup
mongorestore --uri=mongodb://user:pass@host:port/dbname /backup/path
```

### Configuration Management

Version control and manage application configurations:

- **Configuration Files**: Store environment-specific configurations in version control
- **Secrets Management**: Use secrets managers (AWS Secrets Manager, HashiCorp Vault)
- **Configuration Validation**: Validate configurations before deployment

### Disaster Recovery

Test and document recovery procedures:

- **RTO/RPO Targets**: Define Recovery Time Objective and Recovery Point Objective
- **Recovery Testing**: Regular testing of backup restoration procedures
- **Documentation**: Maintain up-to-date recovery runbooks

**Section sources**
- [BUILD.md:424-459](file://doc/BUILD.md#L424-L459)

## Security Hardening

### Firewall Configuration

Implement network-level security controls:

- **Port Restrictions**: Allow only necessary ports (80, 443, 27017 internally)
- **IP Whitelisting**: Restrict administrative access to known IP ranges
- **Network Segmentation**: Separate database tier from application tier

### SSL Certificate Management

Automate certificate lifecycle management:

- **Certificate Renewal**: Automated renewal with Let's Encrypt
- **Certificate Monitoring**: Alert on upcoming expirations
- **Cipher Suite Configuration**: Use modern, secure cipher suites

### Access Control Policies

Implement comprehensive access controls:

#### Application Level
- **JWT Token Validation**: Secure token generation and validation
- **Role-Based Access Control**: Implement user roles and permissions
- **Input Validation**: Sanitize and validate all user inputs

#### Infrastructure Level
- **Container Security**: Run containers with minimal privileges
- **Database Security**: Restrict database access to application containers only
- **Audit Logging**: Log all administrative actions and security events

### Security Monitoring

Deploy security monitoring and alerting:

- **Intrusion Detection**: Monitor for suspicious activities
- **Vulnerability Scanning**: Regular scanning of dependencies and containers
- **Compliance Checking**: Ensure adherence to security standards

**Section sources**
- [BUILD.md:380-391](file://doc/BUILD.md#L380-L391)

## Performance Optimization

### Database Optimization

Optimize MongoDB performance for production workloads:

- **Index Strategy**: Create appropriate indexes for query patterns
- **Connection Pooling**: Configure optimal connection pool sizes
- **Query Optimization**: Analyze and optimize slow queries

### Application Performance

Improve application response times:

- **Caching Strategy**: Implement Redis caching for frequently accessed data
- **API Rate Limiting**: Prevent abuse and ensure fair resource usage
- **Response Compression**: Enable compression for API responses

### Frontend Optimization

Enhance user experience through optimization:

- **Bundle Optimization**: Minimize JavaScript bundle size
- **Image Optimization**: Use WebP format and lazy loading
- **CDN Integration**: Serve static assets through Content Delivery Networks

### Resource Allocation

Proper resource management for production deployments:

- **Memory Limits**: Set appropriate memory limits for containers
- **CPU Quotas**: Allocate CPU resources based on workload requirements
- **Disk Space Monitoring**: Monitor and alert on disk space usage

**Section sources**
- [BUILD.md:498-504](file://doc/BUILD.md#L498-L504)

## Troubleshooting Guide

### Common Deployment Issues

#### Database Connection Problems
- **Symptoms**: Connection timeouts, authentication failures
- **Solutions**: Verify MongoDB URI, check network connectivity, validate credentials
- **Diagnostic Tools**: MongoDB shell, connection string validators

#### Container Communication Issues
- **Symptoms**: Service discovery failures, DNS resolution problems
- **Solutions**: Check Docker networking, verify service names, validate port mappings
- **Diagnostic Tools**: Docker logs, network inspection commands

#### SSL/TLS Configuration Errors
- **Symptoms**: Certificate errors, protocol negotiation failures
- **Solutions**: Verify certificate validity, check cipher suite compatibility
- **Diagnostic Tools**: SSL Labs, OpenSSL commands

### Performance Issues

#### Slow API Responses
- **Investigation**: Database query analysis, application profiling
- **Solutions**: Add indexes, optimize queries, implement caching
- **Monitoring Tools**: APM tools, database query analyzers

#### High Memory Usage
- **Investigation**: Memory leak detection, garbage collection tuning
- **Solutions**: Optimize memory-intensive operations, adjust Node.js flags
- **Monitoring Tools**: Process monitors, memory profilers

### Security Issues

#### Authentication Failures
- **Investigation**: JWT token validation, session management
- **Solutions**: Verify secret keys, check token expiration, review authentication flow
- **Tools**: JWT debuggers, authentication logs

#### Unauthorized Access Attempts
- **Investigation**: Review access logs, identify attack patterns
- **Solutions**: Implement rate limiting, strengthen access controls
- **Tools**: Security monitoring, intrusion detection systems

**Section sources**
- [BUILD.md:380-391](file://doc/BUILD.md#L380-L391)

## Maintenance Procedures

### Routine Maintenance Tasks

#### Daily Tasks
- **Health Checks**: Verify all services are running and responsive
- **Log Review**: Check for errors and warnings in application logs
- **Backup Verification**: Confirm successful completion of scheduled backups

#### Weekly Tasks
- **Performance Review**: Analyze application performance metrics
- **Security Updates**: Apply security patches and updates
- **Capacity Planning**: Review resource usage trends and plan scaling

#### Monthly Tasks
- **Database Maintenance**: Perform database optimization and cleanup
- **Certificate Renewal**: Check and renew SSL certificates if needed
- **Disaster Recovery Testing**: Test backup restoration procedures

### Update and Upgrade Procedures

#### Application Updates
1. **Testing**: Deploy updates to staging environment first
2. **Database Migration**: Execute schema migrations safely
3. **Rollback Plan**: Prepare rollback procedures for failed updates
4. **Monitoring**: Closely monitor application after updates

#### Dependency Updates
- **Security Patches**: Prioritize security-related dependency updates
- **Compatibility Testing**: Test updates in non-production environments
- **Gradual Rollout**: Implement phased rollout for critical updates

### Capacity Planning

#### Resource Monitoring
- **Usage Trends**: Monitor resource consumption patterns
- **Growth Projections**: Plan for future capacity needs
- **Scaling Triggers**: Define thresholds for automatic scaling

#### Scaling Strategies
- **Horizontal Scaling**: Add more application instances
- **Vertical Scaling**: Increase resources for existing instances
- **Database Scaling**: Implement read replicas and sharding

**Section sources**
- [BUILD.md:498-504](file://doc/BUILD.md#L498-L504)

## Scaling Considerations

### Horizontal Scaling

Scale application instances horizontally for increased capacity:

- **Load Balancing**: Distribute traffic across multiple application instances
- **Session Management**: Use external session storage (Redis) for stateless applications
- **Database Scaling**: Implement read replicas for read-heavy workloads

### Vertical Scaling

Increase resources for individual instances when horizontal scaling is insufficient:

- **Memory Allocation**: Increase RAM for memory-intensive operations
- **CPU Resources**: Allocate more CPU cores for compute-bound tasks
- **Storage Expansion**: Expand disk space for growing data requirements

### Database Scaling

Implement database scaling strategies for high-traffic scenarios:

- **Read Replicas**: Distribute read queries across multiple database instances
- **Sharding**: Partition data across multiple database servers
- **Connection Pooling**: Optimize database connection management

### Caching Strategy

Implement multi-layer caching for improved performance:

- **Application Cache**: In-memory caching for frequently accessed data
- **Database Cache**: Query result caching at the database level
- **CDN Caching**: Cache static assets and API responses at edge locations

### Monitoring and Alerting

Set up comprehensive monitoring for scaled environments:

- **Infrastructure Monitoring**: Track resource utilization across all instances
- **Application Monitoring**: Monitor application performance and health
- **Business Metrics**: Track user activity and business KPIs
- **Alerting**: Configure alerts for critical issues and performance degradation

**Section sources**
- [BUILD.md:498-504](file://doc/BUILD.md#L498-L504)

## Conclusion

QuickLink provides a robust, production-ready solution for link bookmarking and credential management. The modular architecture, comprehensive security measures, and scalable design make it suitable for both small-scale personal use and enterprise deployments.

Key strengths of the deployment approach include:

- **Containerization**: Docker-based deployment ensures consistency across environments
- **Security**: Comprehensive security measures including encryption, authentication, and access controls
- **Scalability**: Horizontal and vertical scaling capabilities for growing workloads
- **Maintainability**: Clear separation of concerns and comprehensive documentation
- **Monitoring**: Built-in health checks and logging for operational visibility

For successful production deployment, organizations should:

1. Follow the provided Docker Compose configuration as a baseline
2. Implement proper environment variable management and secrets handling
3. Configure appropriate monitoring and alerting systems
4. Establish regular maintenance and backup procedures
5. Conduct thorough security assessments and penetration testing
6. Plan for capacity growth and implement scaling strategies proactively

The combination of modern technologies, security best practices, and operational considerations makes QuickLink an excellent choice for organizations requiring secure link and credential management capabilities.