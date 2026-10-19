import bcrypt from 'bcryptjs';

function readHidden(prompt) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let buffer = '';
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\u0003') {
          process.stdout.write('\n');
          process.exit(130);
        }
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          process.stdout.write('\n');
          return resolve(buffer);
        }
        buffer = ch === '\u007f' || ch === '\b' ? buffer.slice(0, -1) : buffer + ch;
      }
    };
    stdin.on('data', onData);
  });
}

async function readPiped() {
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return data.replace(/\r?\n$/, '');
}

const interactive = Boolean(process.stdin.isTTY);
const password = interactive ? await readHidden('New admin password: ') : await readPiped();

if (password.length < 12) {
  console.error('Use at least 12 characters.');
  process.exit(1);
}
if (interactive && (await readHidden('Repeat password: ')) !== password) {
  console.error('Passwords do not match.');
  process.exit(1);
}

console.log(`ADMIN_PASSWORD_HASH='${await bcrypt.hash(password, 12)}'`);
