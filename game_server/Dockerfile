FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app/ZAMIN_FK_MANAGEMENT/game_server
COPY game_server/package.json ./package.json
RUN npm install --omit=dev && npm cache clean --force
COPY game_server/src ./src
COPY game_server/db ./db
COPY game_client /app/ZAMIN_FK_MANAGEMENT/game_client
RUN mkdir -p /app/ZAMIN_FK_MANAGEMENT/game_server/uploads && chown -R node:node /app/ZAMIN_FK_MANAGEMENT
USER node
EXPOSE 8080
CMD ["node","src/server.js"]
