FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Copy backend code
COPY . .

# Environment variables for Supabase/GitHub should be set at runtime or via Docker Compose
# ENV SUPABASE_URL=your_supabase_url
# ENV SUPABASE_ANON_KEY=your_supabase_anon_key
# ENV GITHUB_TOKEN=your_github_token

# Expose port if running an HTTP server (uncomment if needed)
# EXPOSE 5000

# Start the backend (replace with your actual entry point if different)
CMD ["node", "applyBonuses.js"]