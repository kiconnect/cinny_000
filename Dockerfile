## Builder
FROM node:24.13.1-alpine AS builder

WORKDIR /src

COPY .npmrc package.json package-lock.json /src/
RUN npm ci
COPY . /src/
ENV NODE_OPTIONS=--max_old_space_size=4096
ARG KICONNECT_ENV=prod
RUN npm run build


## App
FROM nginx:1.29.8-alpine

ARG KICONNECT_ENV=prod
COPY --from=builder /src/dist-${KICONNECT_ENV} /app
COPY --from=builder /src/docker-nginx.conf /etc/nginx/conf.d/default.conf

RUN rm -rf /usr/share/nginx/html \
  && ln -s /app /usr/share/nginx/html
