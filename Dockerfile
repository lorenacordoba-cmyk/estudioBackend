FROM node:22.22.3-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm install --omit=dev
COPY src ./src
COPY scripts ./scripts
EXPOSE 3001
CMD ["npm", "start"]
