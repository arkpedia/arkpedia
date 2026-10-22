# The account-import relay's container: server.mjs and wisp-js, nothing else.
FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force
COPY server.mjs ./
USER node
EXPOSE 8080
CMD ["node", "server.mjs"]
