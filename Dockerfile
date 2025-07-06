# Use Node.js 18 LTS Alpine image for smaller size and security
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \
    curl \
    git \
    python3 \
    make \
    g++ \
    && rm -rf /var/cache/apk/*

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S blockchain-sms -u 1001

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# Copy application code
COPY . .

# Create logs directory
RUN mkdir -p logs && \
    chown -R blockchain-sms:nodejs logs

# Set proper permissions
RUN chown -R blockchain-sms:nodejs /app

# Switch to non-root user
USER blockchain-sms

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Default command
CMD ["node", "server.js"]