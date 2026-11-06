FROM node:22.22.3-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY .env.production.defaults ./.env.production.defaults
COPY src ./src
COPY scripts ./scripts
EXPOSE 8080
CMD ["npm", "start"]
