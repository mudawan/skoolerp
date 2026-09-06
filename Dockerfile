FROM node:22-alpine

WORKDIR /app

# Install dependencies first for efficient layer caching
COPY package*.json ./
RUN npm install

# Copy application source code
COPY . .

# Build frontend and bundled backend server
RUN npm run build

# Expose standard application port
EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production

# Start production server
CMD ["npm", "start"]
