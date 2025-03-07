# Build stage
FROM node:18-alpine as builder

WORKDIR /usr/src/app

RUN addgroup -S client && adduser -S client -G client

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including devDependencies)
RUN npm install

# Copy source code
COPY . .

# Build TypeScript code
RUN npm run build

# Development stage
FROM node:18-alpine as development

WORKDIR /usr/src/app

RUN addgroup -S client && adduser -S client -G client

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Create a startup script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Use the startup script as entrypoint
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

# Start the application
CMD npm run dev
