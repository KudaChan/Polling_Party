# Build stage
FROM node:18-alpine as builder

WORKDIR /usr/src/app

RUN addgroup -S client && adduser -S client -G client

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build TypeScript code
RUN npm run build

# Production stage
FROM node:18-alpine

WORKDIR /usr/src/app

RUN addgroup -S client && adduser -S client -G client

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm install --production

# Copy built files from builder stage
COPY --from=builder /usr/src/app/dist ./dist

# Expose port
EXPOSE 3000

USER client

# Start the application
CMD ["npm", "start"]