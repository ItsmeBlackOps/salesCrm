FROM node:18-alpine

WORKDIR /usr/src/app

# Copy package files first for better caching
COPY package*.json ./

# Install deps (will be overwritten by compose volume during dev)

RUN npm install
#RUN npm run build


# Copy everything else
COPY . .

EXPOSE 9911

#CMD ["npm", "run", "dev"]
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "9911", "--open", "false"]
