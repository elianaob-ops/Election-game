FROM node:24-bookworm-slim
WORKDIR /app
COPY --chown=node:node package.json ./
# Preserve the original party catalog and unchanged artwork.
COPY --chown=node:node public/ ./public/
# Community accounts, branding and the existing application.
COPY --chown=node:node debbie-community-update/server.mjs debbie-community-update/auth.mjs ./
COPY --chown=node:node debbie-community-update/public/ ./public/
# Apply the latest update already uploaded to GitHub.
COPY --chown=node:node debbie-community-update/election-submit-update/server.mjs ./
COPY --chown=node:node debbie-community-update/election-submit-update/public/ ./public/
RUN mkdir -p /data && chown node:node /data
ENV NODE_ENV=production PORT=3000 DB_PATH=/data/game.sqlite
EXPOSE 3000
USER node
CMD ["node", "server.mjs"]
