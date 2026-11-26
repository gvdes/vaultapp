# Imagen lista para producción: compila la app y la sirve con nginx.
#
#   Modo API (PHP + MySQL; la API en el mismo dominio bajo /api, o en otro con CORS):
#     docker build -t dga-inventarios --build-arg VITE_API_URL=/api .
#   Modo Supabase (anterior):
#     docker build -t dga-inventarios \
#       --build-arg VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co \
#       --build-arg VITE_SUPABASE_ANON_KEY=TU_ANON_KEY .
#   docker run -p 8080:80 dga-inventarios
#   (Para servir /api desde esta misma imagen, ver el bloque opcional "location /api/" de nginx.conf.)
#
# Las variables VITE_* se incrustan al COMPILAR (no se leen en tiempo de ejecución).
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_API_URL
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG PUBLIC_PATH=/
ENV VITE_API_URL=$VITE_API_URL \
    VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    PUBLIC_PATH=$PUBLIC_PATH
RUN npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/spa /usr/share/nginx/html
EXPOSE 80
