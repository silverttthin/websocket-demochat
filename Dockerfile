from node:23
workdir /app

copy package*.json ./
run npm install
copy . .
expose 3000
CMD ["node", "app.js"]