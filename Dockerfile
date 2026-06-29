# Use the official Node.js 20 image
FROM node:20-slim

# Install ffmpeg, python3, and yt-dlp for audio streaming
RUN apt-get update && apt-get install -y ffmpeg python3 python-is-python3 curl && \
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp && \
    rm -rf /var/lib/apt/lists/*

# Create and change to the app directory
WORKDIR /usr/src/app

# Copy application dependency manifests to the container image
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy local code to the container image
COPY . .

# Expose the port used by the Express server
EXPOSE 7860

# Run the bot
CMD [ "node", "index.js" ]
