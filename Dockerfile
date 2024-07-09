FROM node:18.18.2

COPY . /app

WORKDIR /app
RUN npm install
CMD [ "npm", "run", "start:prod" ]

