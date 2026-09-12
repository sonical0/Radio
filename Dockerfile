FROM nginx:alpine
COPY index.html stations.json /usr/share/nginx/html/
EXPOSE 80
