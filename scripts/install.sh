#!/usr/bin/env bash
# One-command installer: detects your existing Docker network (e.g. the one your
# n8n stack uses), asks for your domain, and brings the app up in its own
# standalone compose file — it does NOT touch your existing n8n docker-compose.yml,
# so there's no risk of breaking your n8n setup.
set -e

echo "=== Social Poster installer ==="
echo

# 1. Make sure Docker is available
if ! command -v docker &> /dev/null; then
  echo "Docker isn't installed or not on PATH. Install Docker first, then re-run this script."
  exit 1
fi

# 2. Detect existing Docker networks and let the user pick (or skip)
echo "Existing Docker networks on this VPS:"
docker network ls --format '  {{.Name}}'
echo
read -p "Which network does your n8n/Traefik stack use? (press Enter to skip / run standalone): " NETWORK_NAME

# 3. Ask for the domain this app will live on
read -p "What subdomain will this app use? (e.g. social.yourdomain.com): " APP_DOMAIN
if [ -z "$APP_DOMAIN" ]; then
  echo "A domain is required for OAuth callbacks to work. Exiting."
  exit 1
fi

# 4. Set up .env if it doesn't exist yet
cd "$(dirname "$0")/.."
if [ ! -f .env ]; then
  cp .env.example .env
  # Pre-fill the redirect URIs using the domain we just collected
  sed -i.bak "s|http://localhost:3300|https://${APP_DOMAIN}|g" .env
  rm -f .env.bak
  echo
  echo ">>> .env created with redirect URIs pointing to https://${APP_DOMAIN}"
  echo ">>> You still need to fill in the actual API credentials — opening it now."
  echo ">>> (Ctrl+X to save and exit if using nano)"
  read -p "Press Enter to open .env in nano..."
  nano .env
else
  echo ".env already exists — leaving it as-is."
fi

# 5. Generate a standalone compose file (doesn't touch your n8n compose file)
COMPOSE_FILE="docker-compose.generated.yml"

if [ -n "$NETWORK_NAME" ]; then
  cat > "$COMPOSE_FILE" << EOF
services:
  social-poster:
    build: .
    container_name: social-poster
    restart: unless-stopped
    env_file:
      - ./.env
    volumes:
      - social-poster-data:/app/data
    networks:
      - shared_network
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.social-poster.rule=Host(\`${APP_DOMAIN}\`)"
      - "traefik.http.routers.social-poster.entrypoints=websecure"
      - "traefik.http.routers.social-poster.tls.certresolver=letsencrypt"
      - "traefik.http.services.social-poster.loadbalancer.server.port=3300"

volumes:
  social-poster-data:

networks:
  shared_network:
    name: ${NETWORK_NAME}
    external: true
EOF
else
  cat > "$COMPOSE_FILE" << EOF
services:
  social-poster:
    build: .
    container_name: social-poster
    restart: unless-stopped
    env_file:
      - ./.env
    ports:
      - "3300:3300"
    volumes:
      - social-poster-data:/app/data

volumes:
  social-poster-data:
EOF
  echo
  echo ">>> No network selected: running standalone on port 3300."
  echo ">>> You'll need to set up your own reverse proxy / SSL for ${APP_DOMAIN} -> this VPS:3300"
fi

# 6. Build and start
echo
echo "=== Building and starting the container ==="
docker compose -f "$COMPOSE_FILE" up -d --build

echo
echo "=== Done ==="
echo "Check logs with:   docker compose -f $COMPOSE_FILE logs -f social-poster"
if [ -n "$NETWORK_NAME" ]; then
  echo "Test with:         curl https://${APP_DOMAIN}/health"
else
  echo "Test with:         curl http://localhost:3300/health"
fi
