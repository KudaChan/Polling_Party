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

# Production stage
FROM node:18-alpine

WORKDIR /usr/src/app

RUN addgroup -S client && adduser -S client -G client

# Copy package files and install ALL dependencies for scripts
COPY package*.json ./
RUN npm install

# Copy built files and source files (needed for ts-node)
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/src ./src
COPY --from=builder /usr/src/app/scripts ./scripts
COPY --from=builder /usr/src/app/tsconfig.json ./

# Expose port
EXPOSE 3000

USER client

# Start the application
CMD ["npm", "start"]
