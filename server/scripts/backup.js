// Consistent, point-in-time copy of the live database (safe while the app is running).
//   npm run backup                       → server/backups/agrovet-YYYYMMDD-HHMMSS.db
//   npm run backup -- /path/to/folder    → custom folder
//   KEEP=30 npm run backup               → keep the newest 30 copies (default 14)
//   BACKUP_S3_BUCKET=...                 → also upload a gzipped copy to S3-compatible storage (see .env.example)
// Restore: stop the app, then copy a backup over the file named in DATABASE_PATH.
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

// Same database location rules as the app (see server/src/config.js), without needing JWT_SECRET.
const root = fileURLToPath(new URL('../../', import.meta.url));
try { process.loadEnvFile(path.join(root, '.env')); } catch { /* no .env */ }
const config = {
  databasePath: process.env.DATABASE_PATH
    ? path.resolve(root, process.env.DATABASE_PATH)
    : path.join(root, 'server', 'data', 'agrovet.db'),
};

const outDir = path.resolve(process.argv[2] ?? path.join(path.dirname(config.databasePath), '..', 'backups'));
const keep = Math.max(Number(process.env.KEEP) || 14, 1);

if (!fs.existsSync(config.databasePath)) {
  console.error(`No database found at ${config.databasePath}`);
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
const target = path.join(outDir, `agrovet-${stamp}.db`);

const db = new Database(config.databasePath);
try {
  db.exec('PRAGMA busy_timeout = 10000');
  db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`); // consistent snapshot, including anything still in the WAL
} finally {
  db.close();
}

const size = (fs.statSync(target).size / 1024).toFixed(0);
console.log(`Backup written: ${target} (${size} KB)`);

const old = fs.readdirSync(outDir).filter((f) => /^agrovet-\d{8}-\d{6}\.db$/.test(f)).sort().reverse().slice(keep);
for (const f of old) {
  fs.unlinkSync(path.join(outDir, f));
  console.log(`Removed old backup: ${f}`);
}

const bucket = process.env.BACKUP_S3_BUCKET;
if (bucket) {
  const prefix = process.env.BACKUP_S3_PREFIX ?? 'agrovet/';
  const keepRemote = Math.max(Number(process.env.KEEP_REMOTE) || 30, 1);
  const { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } = await import('@aws-sdk/client-s3');
  const client = new S3Client({
    region: process.env.BACKUP_S3_REGION || 'auto',
    endpoint: process.env.BACKUP_S3_ENDPOINT || undefined,
    forcePathStyle: process.env.BACKUP_S3_PATH_STYLE === 'true',
    credentials: {
      accessKeyId: process.env.BACKUP_S3_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.BACKUP_S3_SECRET_ACCESS_KEY ?? '',
    },
  });
  try {
    const key = `${prefix}${path.basename(target)}.gz`;
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: zlib.gzipSync(fs.readFileSync(target)),
      ContentType: 'application/gzip',
    }));
    console.log(`Uploaded: s3://${bucket}/${key}`);

    const keys = [];
    let token;
    do {
      const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
      for (const item of page.Contents ?? []) keys.push(item.Key);
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);

    const stale = keys.filter((k) => /agrovet-\d{8}-\d{6}\.db\.gz$/.test(k)).sort().reverse().slice(keepRemote);
    if (stale.length) {
      await client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: stale.map((Key) => ({ Key })), Quiet: true } }));
      console.log(`Removed ${stale.length} old remote backup(s)`);
    }
  } catch (err) {
    console.error(`Off-site upload failed: ${err.message}`);
    process.exit(2);
  }
}
