FROM node:22-alpine

WORKDIR /app

# Install dependencies first for caching
COPY package*.json ./
RUN npm install --legacy-peer-deps

# Copy the rest of the workspace
COPY . .

# Expose the application port
EXPOSE 4000

CMD ["npm", "run", "dev"]
