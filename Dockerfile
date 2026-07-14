# Debian-based (glibc) so better-sqlite3 can use prebuilt binaries.
# Alpine (musl) has no prebuilds and no compiler toolchain -> build fails.
FROM node:20-slim

WORKDIR /app

# Install backend deps
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev

# Install frontend deps and build
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm ci
COPY frontend/ ./frontend/
RUN cd frontend && npm run build

# Copy backend source
COPY backend/ ./backend/

EXPOSE 3001

# Seed on first boot only (keeps data when a volume is mounted at /app/backend/data)
CMD ["sh", "-c", "[ -f backend/food_delivery.db ] || node backend/seed.js; node backend/server.js"]
