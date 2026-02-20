FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm install --legacy-peer-deps
COPY . .
ENV NEXTAUTH_URL=https://musikrum.u6x.one
ENV NEXTAUTH_SECRET=build-placeholder
ENV SPOTIFY_CLIENT_ID=build-placeholder
ENV SPOTIFY_CLIENT_SECRET=build-placeholder
ENV DATABASE_URL=file:/data/dev.db
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
RUN npm install -g prisma@6
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
