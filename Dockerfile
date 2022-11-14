FROM node:lts-alpine3.16
ADD web-tools /opt/web-tools
WORKDIR /opt/web/tools
CMD npm install
RUN npm run
EXPOSE 3000
