# Deploying Agrovet Manager

The app is one Node process that serves both the API and the built web app, with a single SQLite file for data.
That keeps hosting simple, with two rules:

1. **The database file must live on a persistent disk.** Anything on the container's normal filesystem is erased on every deploy.
2. **Run exactly one instance.** SQLite is a single-writer database; do not scale horizontally.

## Option A – Render (easiest, works from a phone browser)

Cost: roughly **US$7/month** (Starter web service) **+ US$0.25/month per GB of disk**. Check [render.com/pricing](https://render.com/pricing) for current prices. The free tier is not suitable: it sleeps when idle and cannot attach a disk.

1. Push this repository to GitHub (private is fine).
2. Render dashboard → **New → Blueprint** → connect GitHub → choose the repository. Render reads `render.yaml`, creates the service, the 1 GB disk and a random `JWT_SECRET`.
3. Wait for the first build (a few minutes). Open the `https://….onrender.com` address.
4. Register your own shop first to check everything works, then share the address.
5. Optional custom domain: service → **Settings → Custom Domains**; Render issues the HTTPS certificate.

Updating: commit and push; Render redeploys automatically. Data on the disk is kept.

## Option B – Your own server (cheapest, more work)

Any small VPS (1 GB RAM is plenty) with Docker:

```bash
git clone <your-repo> && cd agrovet-manager
docker build -t agrovet-manager .
docker run -d --name agrovet --restart unless-stopped -p 127.0.0.1:4000:4000 \
  -e JWT_SECRET="$(openssl rand -hex 32)" -v agrovet-data:/data agrovet-manager
```

Put a reverse proxy with HTTPS in front (Caddy is the simplest: `your.domain { reverse_proxy 127.0.0.1:4000 }`).
**Keep the `JWT_SECRET` value** (store it somewhere safe); if you lose it everyone is signed out, though no data is lost.

## Environment variables

| Variable | Notes |
| --- | --- |
| `NODE_ENV=production` | Set by the Dockerfile. Turns on secure cookies and strict config checks. |
| `JWT_SECRET` | **Required.** Long random string. |
| `DATABASE_PATH` | Must point at the persistent disk, e.g. `/data/agrovet.db`. |
| `PORT` | Set by the platform; defaults to 4000. |
| `COOKIE_SECURE` | `true` by default in production. Only set `false` to test over plain HTTP. |
| `TRUST_PROXY` | Defaults to `1` in production (one proxy in front). |

## Backups (do not skip)

You will be holding other shops' records. Back up the database regularly and test a restore.

```bash
npm run backup                    # → server/backups/agrovet-<timestamp>.db, keeps the newest 14
KEEP=30 npm run backup -- /path   # custom folder / number to keep
```

In Docker: `docker exec agrovet node --disable-warning=ExperimentalWarning server/scripts/backup.js /data/backups`
Copy the file off the server (to your computer or cloud storage). On Render, also enable disk snapshots in the dashboard if your plan offers them.

**Restore:** stop the app, copy a backup over the file named in `DATABASE_PATH`, start the app.

## Before real shops sign up

- [ ] Registered a test shop, added a product, made a sale, and signed out/in on the live address.
- [ ] `JWT_SECRET` set and saved somewhere safe.
- [ ] Ran a backup and opened the copy to confirm it contains data.
- [ ] HTTPS works (padlock in the browser). Login cookies are marked secure and will not work without it.
- [ ] Decided how you will answer "I forgot my password" (there is no email reset yet): the owner can reset staff passwords from Team; for an owner you would need to update the database by hand.

## Privacy

Every shop's data sits in one database, separated by account in the code and covered by automated tests. As the operator you can technically read all of it, so tell shops how you handle their data, and keep backups private.
