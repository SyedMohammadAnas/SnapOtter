FROM node:22-alpine
WORKDIR /app
COPY server.mjs ./
ENV NODE_ENV=production
USER node
CMD ["node", "server.mjs"]
