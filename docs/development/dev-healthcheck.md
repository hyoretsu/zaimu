# Development Compose health

The development container probes API `/health`, frontend HTTP, PostgreSQL
`SELECT 1`, Redis `PING`, and an authenticated RabbitMQ connection every 30 seconds.
All checks must pass. Probes run concurrently with a six-second overall deadline;
three consecutive failures mark the container unhealthy. A five-minute startup
period allows dependency installation, contract emission, and migrations to finish.

The probe runs from `backend`, loading the same Bun environment files as the API.
Frontend port comes from `frontend/.env.local`, then `frontend/.env`, defaulting to
5173; API uses `PORT`, defaulting to 3333. Database and Redis URLs must be configured;
RabbitMQ follows the application's localhost fallback. Checks never write database
rows, Redis keys, or broker topology. Output contains service statuses only.

Inspect current health with `docker compose ps`. Inspect recent probe results with:

```sh
docker inspect --format '{{json .State.Health}}' "$(docker compose ps -q dev)"
```

Run manually with `docker compose exec dev bun run --cwd backend ../scripts/dev-healthcheck.ts`.
After startup grace, three consecutive failed probes send SIGTERM to PID 1.
Docker init forwards it to the development process; `restart: unless-stopped`
restarts the container, including installation and existing startup steps.
A successful probe resets the failure count. Persistent dependency outages cause
repeated restarts with a fresh five-minute grace period each time.
This checks service availability, not worker progress or schema compatibility.
