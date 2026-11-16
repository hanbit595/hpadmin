// 대표(admin) 계정 생성 — 대표가 직접 실행한다.
//   cd D:\hpadmin\app
//   node scripts/create-admin.mjs
// 비밀번호는 화면에 표시하지 않고 2번 입력받는다. 원문은 파일·출력에 남기지 않는다.
// 원격 D1(hanbit-admin-db)의 users 에 role=admin 1건을 넣는다.
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { hashPassword } from './lib/password.mjs';

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
let muted = false;
rl._writeToOutput = (s) => {
  if (!muted) rl.output.write(s);
};

function ask(prompt, hidden = false) {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    muted = hidden;
    rl.question('', (answer) => {
      muted = false;
      if (hidden) process.stdout.write('\n');
      resolve(answer);
    });
  });
}

const sq = (s) => `'${s.replace(/'/g, "''")}'`;

async function main() {
  console.log('한빛이노텍 관리자 — 대표 계정 만들기 (원격 D1: hanbit-admin-db)\n');

  const username = (await ask('아이디(영문·숫자·._- 3~32자): ')).trim();
  if (!/^[A-Za-z0-9._-]{3,32}$/.test(username)) throw new Error('아이디는 영문·숫자·._- 로 3~32자여야 합니다.');

  const displayName = (await ask('표시 이름(예: 홍길동): ')).trim();
  if (!displayName || displayName.length > 40) throw new Error('표시 이름은 1~40자여야 합니다.');

  const pw1 = await ask('비밀번호(8자 이상, 화면에 표시되지 않음): ', true);
  if (pw1.length < 8) throw new Error('비밀번호는 8자 이상이어야 합니다.');
  if (pw1.length > 256) throw new Error('비밀번호가 너무 깁니다(256자 이하).');
  const pw2 = await ask('비밀번호 다시 입력: ', true);
  if (pw1 !== pw2) throw new Error('두 비밀번호가 다릅니다.');
  rl.close();

  const { hash, salt } = await hashPassword(pw1);
  const sql =
    'INSERT INTO users (username, display_name, role, password_hash, password_salt, active) VALUES (' +
    [sq(username), sq(displayName), "'admin'", sq(hash), sq(salt), '1'].join(', ') +
    ');\n';

  // 임시 SQL 파일(해시·salt 만 포함)은 실행 직후 삭제한다.
  const file = join(tmpdir(), `hanbit-admin-${randomUUID()}.sql`);
  writeFileSync(file, sql, { encoding: 'utf8', mode: 0o600 });
  let result;
  try {
    console.log('\n원격 데이터베이스에 저장하는 중...');
    result = spawnSync(`npx wrangler d1 execute hanbit-admin-db --remote --yes --file "${file}"`, {
      cwd: APP_DIR,
      shell: true,
      encoding: 'utf8',
    });
  } finally {
    rmSync(file, { force: true });
  }

  const out = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (result.status !== 0) {
    if (/UNIQUE constraint failed/i.test(out)) throw new Error(`이미 있는 아이디입니다: ${username}`);
    throw new Error('저장에 실패했습니다. "npx wrangler whoami" 로 Cloudflare 로그인 상태를 확인해 주세요.');
  }
  console.log(`완료: 대표 계정 "${username}"(${displayName}, admin)을 만들었습니다.`);
}

main().catch((e) => {
  rl.close();
  console.error(`\n오류: ${e.message}`);
  process.exit(1);
});
