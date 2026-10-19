# Build the web app, then run API + static site from one small image.
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN apk add --no-cache python3 make g++ && npm install && apk del python3 make g++
COPY . .
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production PORT=4000 DATABASE_PATH=/data/agrovet.db
WORKDIR /app
COPY package*.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN apk add --no-cache python3 make g++ && npm install --omit=dev -w server && npm cache clean --force && apk del python3 make g++
COPY server/src server/src
COPY server/scripts server/scripts
COPY --from=build /app/client/dist client/dist
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/src/index.js"]
