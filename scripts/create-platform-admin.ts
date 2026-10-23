// Creates a platform (app-owner) admin. There is no sign-up page for this role: the first
// admin is made here, on the server, by whoever operates the deployment.
//
//   npx tsx scripts/create-platform-admin.ts <username> "<Full Name>" [owner|support|observer]
//
// The password is read from PLATFORM_ADMIN_PASSWORD, or typed at a prompt (not echoed).
// It uses the same database settings as the server (DATABASE_URL or POSTGRES_*).
import 'dotenv/config';
import readline from 'node:readline';
import { dbService } from '../server/db';
import { hashPassword } from '../src/utils/passwords';
import { isPlatformRole } from '../src/utils/platformPermissions';
import { MIN_PLATFORM_PASSWORD } from '../server/platform';

function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const w = (rl as any)._writeToOutput;
    (rl as any)._writeToOutput = function (s: string) {
      if (s.startsWith(question)) w.call(rl, s);
    };
    rl.question(question, (a) => {
      rl.close();
      process.stdout.write('\n');
      resolve(a);
    });
  });
}

async function main() {
  const [username, fullName, roleArg] = process.argv.slice(2);
  const role = roleArg || 'owner';
  if (!username || !fullName || !isPlatformRole(role)) {
    console.error('Usage: create-platform-admin <username> "<Full Name>" [owner|support|observer]');
    process.exit(2);
  }
  if (!/^[a-z0-9._-]{3,64}$/.test(username.toLowerCase())) {
    console.error('Username must be 3–64 characters: letters, digits, dot, dash, underscore.');
    process.exit(2);
  }
  const password = process.env.PLATFORM_ADMIN_PASSWORD || (await askHidden('Password: '));
  if (password.length < MIN_PLATFORM_PASSWORD || password.length > 128) {
    console.error(`Password must be ${MIN_PLATFORM_PASSWORD}–128 characters.`);
    process.exit(2);
  }
  await dbService.init();
  if (await dbService.getPlatformAdminByUsername(username)) {
    console.error(`A platform admin named '${username}' already exists.`);
    process.exit(1);
  }
  const a = await dbService.createPlatformAdmin({ username, fullName, role, passwordHash: await hashPassword(password) });
  await dbService.appendPlatformAudit({
    adminId: a.id, adminUsername: a.username, adminRole: a.role, actionType: 'admin_created',
    actionTitle: 'Platform admin created', description: `Created from the command line with role ${role}.`,
  });
  console.log(`Created platform admin '${a.username}' (${role}).`);
  process.exit(0);
}
main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
