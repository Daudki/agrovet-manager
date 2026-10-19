# Deploying to your own server

One small Linux VM runs everything: the app, automatic HTTPS (Caddy) and scheduled backups, all from `docker-compose.yml`.

## 1. Prepare the server

- Ubuntu 22.04 or newer with Docker and the Compose plugin installed.
- Point a DNS `A` record for your domain at the server's IP.
- Open ports 80 and 443 (and 443/udp) in the firewall. Nothing else needs to be public.

## 2. Configure

```bash
git clone https://github.com/Daudki/agrovet-manager.git
cd agrovet-manager
cp .env.example .env
```

Edit `.env` and set:

- `DOMAIN` – the domain from step 1.
- `JWT_SECRET` – output of `openssl rand -hex 32`.
- Off-site backups – the `BACKUP_S3_*` values for your R2, B2 or S3 bucket.
- Admin panel (optional) – run `docker compose run --rm --no-deps app node server/scripts/admin-hash.js`, paste the printed `ADMIN_PASSWORD_HASH='…'` line into `.env` exactly as printed, and set `ADMIN_EMAIL`.

Compose refuses to start if `DOMAIN` or `JWT_SECRET` is missing.

## 3. Start

```bash
docker compose up -d --build
docker compose ps
```

Caddy gets a certificate on the first request, so the site is live at `https://<DOMAIN>` within a minute. The admin panel is at `/admin`.

## 4. Update

```bash
git pull
docker compose up -d --build
```

Database migrations run on start. Take a backup first if the release changes the schema.

## 5. Backups

The `backup` service snapshots the database every 6 hours (`BACKUP_INTERVAL_SECONDS`), keeps the newest 28 locally in `/data/backups`, uploads a gzipped copy to your bucket and keeps the newest 120 there (`KEEP`, `KEEP_REMOTE`).

Check it works:

```bash
docker compose logs --tail 20 backup
```

Look for `Uploaded: s3://…`. Also confirm the files appear in the bucket. A backup that has never been restored is not proven, so do the restore below once on a spare machine.

### Restore

From a local snapshot:

```bash
docker compose stop app backup
docker compose run --rm --no-deps app ls /data/backups
docker compose run --rm --no-deps app sh -c 'rm -f /data/agrovet.db-wal /data/agrovet.db-shm && cp /data/backups/agrovet-YYYYMMDD-HHMMSS.db /data/agrovet.db'
docker compose up -d
```

From the bucket: download the `.db.gz` file, run `gunzip` on it, then:

```bash
docker compose stop app backup
docker compose cp ./agrovet-YYYYMMDD-HHMMSS.db app:/data/agrovet.db
docker compose run --rm --no-deps app rm -f /data/agrovet.db-wal /data/agrovet.db-shm
docker compose up -d
```

## Go-live checklist

- `https://<DOMAIN>/api/health` returns `{"ok":true}`.
- You can register a test shop, sell, and sign out and in again.
- `docker compose logs backup` shows a successful upload and the files are in the bucket.
- A restore from the bucket has been tried.
- `.env` is not committed and has restricted permissions (`chmod 600 .env`).

## Render

`render.yaml` deploys the same image on Render, but it needs a paid plan because the SQLite file must live on a persistent disk. Free instances sleep and lose their files on restart.
