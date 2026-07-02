FROM node:20-slim

WORKDIR /app

# Install tesseract-ocr + sharp dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-spa \
    libvips-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy backend package files and install
COPY backend/package*.json ./backend/
WORKDIR /app/backend
RUN npm install

# Copy backend source
COPY backend/ .
# Copy frontend source
COPY frontend/ ../frontend/

# Create uploads directory
RUN mkdir -p uploads

EXPOSE 3001

CMD ["node", "server.js"]
