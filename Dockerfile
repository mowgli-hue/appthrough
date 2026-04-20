FROM node:20-alpine

WORKDIR /app

# Install backend deps
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --production

# Install frontend deps and build
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm ci
COPY frontend/ ./frontend/
RUN cd frontend && npm run build

# Copy backend source
COPY backend/ ./backend/

# Seed database
RUN cd backend && node seed.js

EXPOSE 3001

CMD ["node", "backend/server.js"]
