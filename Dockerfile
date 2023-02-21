FROM node:lts-alpine3.16
ADD web-tools /opt/web-tools
WORKDIR /opt/web-tools
RUN npm install
CMD npm start 
EXPOSE 3000
