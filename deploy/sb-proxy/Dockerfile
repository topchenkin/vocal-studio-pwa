FROM node:22-alpine
WORKDIR /app
COPY server.mjs ./server.mjs
ENV BIND=0.0.0.0
EXPOSE 8080
CMD ["node", "server.mjs"]
