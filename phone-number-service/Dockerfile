# Dockerfile for Phone Number Service
FROM node:18-alpine

# Set working directory
WORKDIR /usr/src/app

# Copy package.json and install dependencies
COPY package.json package-lock.json ./
RUN npm install --production

# Copy application code
COPY . .

# Expose the port
EXPOSE 3001

# Run the application
CMD ["node", "index.js"]
