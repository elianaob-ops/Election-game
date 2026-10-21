FROM node:24-bookworm-slim
WORKDIR /app
# Original project supplies package.json, party metadata and unchanged artwork.
COPY --chown=node:node package.json ./
COPY --chown=node:node public/ ./public/
# Apply the update already uploaded inside this repository folder.
COPY --chown=node:node debbie-community-update/server.mjs debbie-community-update/auth.mjs ./
COPY --chown=node:node debbie-community-update/public/ ./public/
RUN mkdir -p /data && chown node:node /data
ENV NODE_ENV=production PORT=3000 DB_PATH=/data/game.sqlite
EXPOSE 3000
USER node
CMD ["node", "server.mjs"]
