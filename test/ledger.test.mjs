import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { MIN_ENV_VALUE_LENGTH, redact } from '../skills/cheffy/scripts/lib/redact.mjs';
import { TraceError, appendEvent, checkLogFile, ensureExcluded, hidkitDir, listRuns, mainRoot, readEvents, runFile, runsDir, setCurrentRun, writeSecure } from '../skills/cheffy/scripts/lib/ledger.mjs';
import { cleanupTempRepos, tempRepo } from './helpers.mjs';

after(cleanupTempRepos);

const synthetic = {
  gh: `ghp_${'A'.repeat(36)}`,
  aws: `AKIA${'B'.repeat(16)}`,
  slack: `xoxb-${'1'.repeat(12)}`,
  jwt: `eyJ${'a'.repeat(12)}.${'b'.repeat(12)}.${'c'.repeat(12)}`,
  key: `sk-ant-${'k'.repeat(24)}`,
  pem: '-----BEGIN RSA PRIVATE KEY-----\nMIIx\n-----END RSA PRIVATE KEY-----',
};

test('redacts every known token format', () => {
  const out = redact(Object.values(synthetic).join(' | '), {});
  assert.equal(out, '[REDACTED:github-token] | [REDACTED:aws-key] | [REDACTED:slack-token] | [REDACTED:jwt] | [REDACTED:api-key] | [REDACTED:private-key]');
});

test('redacts secret assignments and bearer tokens, keeps ordinary fields', () => {
  assert.equal(
    redact('DB_PASSWORD=hunter22 password: "abc def" max_tokens: 100', {}),
    'DB_PASSWORD=[REDACTED:assignment] password: [REDACTED:assignment] max_tokens: 100',
  );
  assert.equal(redact('Authorization: Bearer abcdefgh12345', {}), 'Authorization: [REDACTED:bearer]');
});

test('redacts long secret env values and skips short ones', () => {
  const env = { MY_API_TOKEN: 'tok-value-123456', FEATURE_KEY: 'true', HOME: '/Users/x' };
  assert.equal(redact('a tok-value-123456 b true /Users/x', env), 'a [REDACTED:env] b true /Users/x');
  assert.equal(MIN_ENV_VALUE_LENGTH, 8);
});

test('mainRoot resolves the main checkout from a worktree', () => {
  const repo = tempRepo();
  const wt = `${repo}-wt`;
  execFileSync('git', ['worktree', 'add', '-q', wt], { cwd: repo });
  assert.equal(fs.realpathSync(mainRoot(wt)), repo);
});

test('ensureExcluded adds .hidkit/ once and the tree stays clean', () => {
  const repo = tempRepo();
  assert.equal(ensureExcluded(repo), true);
  assert.equal(ensureExcluded(repo), false);
  const exclude = fs.readFileSync(path.join(repo, '.git/info/exclude'), 'utf8');
  assert.equal(exclude.split('\n').filter((l) => l === '.hidkit/').length, 1);
  appendEvent(repo, 'r-1', { type: 'run_start' });
  assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8' }), '');
});

test('refuses to write when .hidkit is not ignored', () => {
  const repo = tempRepo();
  assert.throws(() => appendEvent(repo, 'r-1', { type: 'run_start' }), /not ignored by git/);
  assert.equal(fs.existsSync(path.join(repo, '.hidkit')), false);
});

test('writes private files and redacts event values', () => {
  const repo = tempRepo();
  ensureExcluded(repo);
  appendEvent(repo, 'r-1', { type: 'decision', reason: `uses ${synthetic.gh}` }, {});
  const file = runFile(repo, 'r-1');
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.equal(fs.statSync(path.dirname(file)).mode & 0o777, 0o700);
  assert.equal(fs.statSync(hidkitDir(repo)).mode & 0o777, 0o700);
  const [event] = readEvents(repo, 'r-1');
  assert.equal(event.reason, 'uses [REDACTED:github-token]');
  assert.equal(event.schema_version, 1);
  assert.equal(event.run_id, 'r-1');
});

test('redacts quoted keys, prefixed keys, CLI flags, URL credentials, Basic auth and truncated PEM blocks', () => {
  assert.equal(redact('{"password":"hunter2xx"}', {}), '{"password":[REDACTED:assignment]}');
  assert.equal(redact('{"DB_PASSWORD": "x1234567"}', {}), '{"DB_PASSWORD": [REDACTED:assignment]}');
  assert.equal(redact('my_password=hunter2xx user_token=abc12345', {}), 'my_password=[REDACTED:assignment] user_token=[REDACTED:assignment]');
  assert.equal(redact('run --password hunter2xx --token=abcdef12 --max-tokens 100', {}), 'run --password [REDACTED:assignment] --token=[REDACTED:assignment] --max-tokens 100');
  assert.equal(redact('clone https://bob:hunter2xx@host/repo.git', {}), 'clone https://bob:[REDACTED:url-credential]@host/repo.git');
  assert.equal(redact('Authorization: Basic dXNlcjpwYXNzd29yZA==', {}), 'Authorization: [REDACTED:basic]');
  assert.equal(redact('-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg\nkqhkiG9w0BAQEF', {}), '[REDACTED:private-key]');
  assert.equal(redact('max_tokens: 100 Basic configuration https://host:8080/path', {}), 'max_tokens: 100 Basic configuration https://host:8080/path');
});

test('redacts values stored under secret-looking keys and the keys themselves', () => {
  const repo = tempRepo();
  ensureExcluded(repo);
  const planted = [`ghp_${'A'.repeat(36)}`, 'hunter2xx', 'abcdef123456', 'zzzzzzzz1234'];
  appendEvent(repo, 'r-1', { type: 'x', password: planted[1], token: planted[2], nested: { api_key: planted[3] }, [planted[0]]: 1, max_tokens: 100 }, {});
  const raw = fs.readFileSync(runFile(repo, 'r-1'), 'utf8');
  for (const value of planted) assert.equal(raw.includes(value), false, value);
  const [event] = readEvents(repo, 'r-1');
  assert.equal(event.password, '[REDACTED:assignment]');
  assert.equal(event.nested.api_key, '[REDACTED:assignment]');
  assert.equal(event['[REDACTED:github-token]'], 1);
  assert.equal(event.max_tokens, 100);
});

test('no planted secret format reaches the ledger on disk', () => {
  const repo = tempRepo();
  ensureExcluded(repo);
  const planted = [
    synthetic.gh, synthetic.aws, synthetic.slack, synthetic.jwt, synthetic.key, 'MIIx',
    'abcdefgh12345', 'hunter22xx', 'envsecret-value-9', 'p4ssw0rdxx', 'dXNlcjpwYXNzd29yZA==',
    'sk_live_xyz123', 'gluedtail9', 'dbpass-hunter9',
  ];
  const text = [
    synthetic.gh, synthetic.aws, synthetic.slack, synthetic.jwt, synthetic.key, synthetic.pem,
    'Authorization: Bearer abcdefgh12345', 'DB_PASSWORD=hunter22xx', 'value envsecret-value-9',
    'https://bob:p4ssw0rdxx@host/x', 'Authorization: Basic dXNlcjpwYXNzd29yZA==',
    'password:', 'API_KEY: sk_live_xyz123', 'password="abc"gluedtail9', 'export DB_PASS=dbpass-hunter9',
  ].join('\n');
  appendEvent(repo, 'r-1', { type: 'note', text, list: [text] }, { MY_API_TOKEN: 'envsecret-value-9' });
  const raw = fs.readFileSync(runFile(repo, 'r-1'), 'utf8');
  for (const value of planted) assert.equal(raw.includes(value), false, value);
  for (const kind of ['github-token', 'aws-key', 'slack-token', 'jwt', 'api-key', 'private-key', 'bearer', 'assignment', 'env', 'url-credential']) {
    assert.ok(raw.includes(`[REDACTED:${kind}]`), kind);
  }
});

test('refuses to write through a symlink and leaves the target untouched', () => {
  const repo = tempRepo();
  ensureExcluded(repo);
  const outside = `${repo}-outside.txt`;
  fs.writeFileSync(outside, 'keep me\n', { mode: 0o644 });
  fs.chmodSync(outside, 0o644);
  fs.mkdirSync(runsDir(repo), { recursive: true });
  fs.symlinkSync(outside, runFile(repo, 'r-3'));
  assert.throws(() => appendEvent(repo, 'r-3', { type: 'run_start' }), TraceError);
  assert.equal(fs.readFileSync(outside, 'utf8'), 'keep me\n');
  assert.equal(fs.statSync(outside).mode & 0o777, 0o644);
});

test('tightens the mode of a pre-existing loose run file', () => {
  const repo = tempRepo();
  ensureExcluded(repo);
  fs.mkdirSync(runsDir(repo), { recursive: true });
  const file = runFile(repo, 'r-1');
  fs.writeFileSync(file, '');
  fs.chmodSync(file, 0o644);
  appendEvent(repo, 'r-1', { type: 'run_start' });
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
});

test('event fields cannot override the envelope', () => {
  const repo = tempRepo();
  ensureExcluded(repo);
  appendEvent(repo, 'r-1', { type: 'x', run_id: 'evil', schema_version: 99, at: 'never' });
  const [event] = readEvents(repo, 'r-1');
  assert.equal(event.run_id, 'r-1');
  assert.equal(event.schema_version, 1);
  assert.match(event.at, /^\d{4}-\d{2}-\d{2}T/);
});

test('rejects run and check ids that could escape the runs directory', () => {
  const repo = tempRepo();
  assert.throws(() => runFile(repo, '../x'), TraceError);
  assert.throws(() => runFile(repo, 'x-1'), TraceError);
  assert.throws(() => checkLogFile(repo, 'r-1', '../x'), TraceError);
  assert.throws(() => checkLogFile(repo, '../r', 'c-1'), TraceError);
  assert.ok(checkLogFile(repo, 'r-1', 'c-1').endsWith(path.join('r-1', 'c-1.log')));
});

test('ensureExcluded from a linked worktree writes the shared exclude file', () => {
  const repo = tempRepo();
  const wt = `${repo}-wt2`;
  execFileSync('git', ['worktree', 'add', '-q', wt], { cwd: repo });
  assert.equal(ensureExcluded(wt), true);
  assert.equal(ensureExcluded(repo), false);
  assert.ok(fs.readFileSync(path.join(repo, '.git/info/exclude'), 'utf8').split('\n').includes('.hidkit/'));
  const root = mainRoot(wt);
  appendEvent(root, 'r-1', { type: 'run_start' });
  for (const cwd of [repo, wt]) assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf8' }), '');
});

test('a secret-shaped prefix does not leave the tail of an assignment value behind', () => {
  const cases = {
    [`PASSWORD=ghp_${'A'.repeat(36)}-tail`]: 'PASSWORD=[REDACTED:assignment]',
    [`password=sk-${'k'.repeat(24)}!!tail`]: 'password=[REDACTED:assignment]',
    [`API_KEY=AKIA${'B'.repeat(16)}.suffix`]: 'API_KEY=[REDACTED:assignment]',
    [`password=xoxb-${'1'.repeat(12)}.tail`]: 'password=[REDACTED:assignment]',
    'password=[REDACTED:evil]realsecret': 'password=[REDACTED:assignment]',
    [`password=sk-${'k'.repeat(24)}"tail`]: 'password=[REDACTED:assignment]',
    [`password=sk-${'k'.repeat(24)}'tail`]: 'password=[REDACTED:assignment]',
    [`password=sk-${'k'.repeat(24)}}tail`]: 'password=[REDACTED:assignment]',
    [`PASSWORD=ghp_${'A'.repeat(36)}"tail`]: 'PASSWORD=[REDACTED:assignment]',
    [`API_KEY=AKIA${'B'.repeat(16)}'x`]: 'API_KEY=[REDACTED:assignment]',
  };
  for (const [input, expected] of Object.entries(cases)) {
    assert.equal(redact(input, {}), expected, input);
    assert.equal(redact(expected, {}), expected, `idempotent: ${expected}`);
  }
});

test('an empty secret value does not swallow the next key', () => {
  assert.equal(redact('password:\nAPI_KEY: sk_live_xyz123', {}), 'password:\nAPI_KEY: [REDACTED:assignment]');
  assert.equal(redact('PASSWORD=\nTOKEN=abc12345', {}), 'PASSWORD=\nTOKEN=[REDACTED:assignment]');
  assert.equal(redact('password: \r\nsecret: hunter22', {}), 'password: \r\nsecret: [REDACTED:assignment]');
});

test('a quoted secret value with a glued tail is redacted whole', () => {
  assert.equal(redact('password="abc"def next', {}), 'password=[REDACTED:assignment] next');
  assert.equal(redact("token='abc'def12345,x", {}), 'token=[REDACTED:assignment],x');
  assert.equal(redact('{"password":"hunter2xx"}', {}), '{"password":[REDACTED:assignment]}');
  assert.equal(redact('{"a":{"password":"hunter2xx"}}', {}), '{"a":{"password":[REDACTED:assignment]}}');
});

test('pass, passphrase, and pwd names are secret names; shell directory names and look-alikes are not', () => {
  const secret = ['export DB_PASS=hunter22', 'SMTP_PASS=hunter22', 'GPG_PASSPHRASE=hunter22', 'passphrase: hunter22', 'db_pwd=hunter22', 'user=bob&pass=hunter22', 'DB_PWD=hunter22'];
  for (const input of secret) {
    const out = redact(input, {});
    assert.ok(!out.includes('hunter22'), input);
    assert.ok(out.endsWith('=[REDACTED:assignment]') || out.endsWith(': [REDACTED:assignment]'), out);
  }
  for (const input of ['PWD=/Users/x/repo', 'OLDPWD=/tmp/x', 'bypass=on', 'compass: north', 'BYPASS=yes']) assert.equal(redact(input, {}), input);
  // Accepted over-redaction: a bare PASS is a secret name, so a Go test line loses the test name.
  assert.equal(redact('--- PASS: TestFoo (0.00s)', {}), '--- PASS: [REDACTED:assignment] (0.00s)');
});

test('a Unicode horizontal space in the separator does not stop the redaction', () => {
  for (const space of [' ', ' ', ' ', '　']) {
    for (const input of [`password:${space}hunter22`, `password${space}=${space}hunter22`, `DB_PASSWORD${space}:${space}hunter22`]) {
      const out = redact(input, {});
      assert.ok(!out.includes('hunter22'), JSON.stringify(input));
      assert.ok(out.endsWith('[REDACTED:assignment]'), JSON.stringify(out));
    }
  }
  // A line separator still ends the separator, so an empty value cannot swallow the next line.
  assert.equal(redact('password: TOKEN=abc12345', {}), 'password: TOKEN=[REDACTED:assignment]');
});

test('pass and passphrase CLI flags with a space-separated value are redacted', () => {
  const cases = {
    'login --pass hunter22 next': 'login --pass [REDACTED:assignment] next',
    'gpg --passphrase hunter22 -d f': 'gpg --passphrase [REDACTED:assignment] -d f',
    'db --db-pass hunter22': 'db --db-pass [REDACTED:assignment]',
    'db --db_pass hunter22': 'db --db_pass [REDACTED:assignment]',
    'db --db-passphrase=hunter22': 'db --db-passphrase=[REDACTED:assignment]',
    'x --PASS hunter22': 'x --PASS [REDACTED:assignment]',
  };
  for (const [input, expected] of Object.entries(cases)) {
    assert.equal(redact(input, {}), expected, input);
    assert.equal(redact(expected, {}), expected, `idempotent: ${expected}`);
  }
  for (const input of ['run --bypass on', 'map --compass north', 'gpg --pass-file /p', 'x --passes 3', 'x --max-tokens 100', 'x --passive yes']) {
    assert.equal(redact(input, {}), input);
  }
});

test('camelCase secret names are secret names', () => {
  for (const input of ['dbPass=hunter22', 'userPwd: hunter22', 'apiToken=hunter22', 'clientSecret: hunter22', '{"smtpPass": "hunter22"}', 'const dbPassphrase = hunter22']) {
    const out = redact(input, {});
    assert.ok(!out.includes('hunter22'), input);
  }
  for (const input of ['compass: north', 'bypass=on', 'encompass=x', 'dbpassage=x']) assert.equal(redact(input, {}), input);
  // Accepted over-redaction: a camelCase name that ends in Pass is a secret name.
  assert.equal(redact('firstPass: done', {}), 'firstPass: [REDACTED:assignment]');
});

test('the new redaction paths stay linear on adversarial input', () => {
  const inputs = {
    nbspSeparator: `password${' '.repeat(200_000)}`,
    nbspWords: 'a '.repeat(100_000),
    nbspColons: 'password: '.repeat(20_000),
    dashedFlag: `--${'a-'.repeat(100_000)}`,
    passFlags: '--db-pass-'.repeat(20_000),
    passSpaces: `--pass${' '.repeat(200_000)}`,
    camel: `${'aPass'.repeat(40_000)}:x`,
    camelUpper: 'Pass'.repeat(50_000),
  };
  redact('warm up --pass x dbPass=y', {});
  for (const [name, input] of Object.entries(inputs)) {
    const start = performance.now();
    redact(input, {});
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 100, `${name} took ${elapsed} ms`);
  }
});

test('glued pass names are secret names; look-alikes and the accepted over-redaction stay as they are', () => {
  for (const name of ['dbpass', 'DBPASS', 'PGPASS', 'DBPass', 'dbPASS', 'mysqlpass']) {
    for (const input of [`${name}=hunter22`, `${name}: hunter22`, `${name} = hunter22`]) {
      const out = redact(input, {});
      assert.ok(!out.includes('hunter22'), input);
      assert.ok(out.endsWith('[REDACTED:assignment]'), out);
      assert.equal(redact(out, {}), out, `idempotent: ${out}`);
    }
  }
  for (const input of ['dbpassage=x', 'bypass=on', 'compass: north', 'BYPASS=yes', 'surpass=1']) assert.equal(redact(input, {}), input);
});

test('pwd and glued pass flags with a space-separated value are redacted', () => {
  const cases = {
    'x --dbPass hunter22 next': 'x --dbPass [REDACTED:assignment] next',
    'x --pwd hunter22': 'x --pwd [REDACTED:assignment]',
    'x --db-pwd hunter22 -v': 'x --db-pwd [REDACTED:assignment] -v',
    'x --dbpass hunter22': 'x --dbpass [REDACTED:assignment]',
    'x --userPass hunter22': 'x --userPass [REDACTED:assignment]',
    'x --db-pwd=hunter22': 'x --db-pwd=[REDACTED:assignment]',
  };
  for (const [input, expected] of Object.entries(cases)) {
    assert.equal(redact(input, {}), expected, input);
    assert.equal(redact(expected, {}), expected, `idempotent: ${expected}`);
  }
  for (const input of ['x --bypass on', 'x --compass north', 'x --pwd-file /p']) assert.equal(redact(input, {}), input);
});

test('curl -u and --user redact the part after the colon', () => {
  const cases = {
    'curl -u alice:hunter22 https://h/x': 'curl -u alice:[REDACTED:assignment] https://h/x',
    'curl --user alice:hunter22 https://h/x': 'curl --user alice:[REDACTED:assignment] https://h/x',
    'curl -s -L https://h/x -u alice:hunter22': 'curl -s -L https://h/x -u alice:[REDACTED:assignment]',
    'curl -ualice:hunter22 https://h': 'curl -ualice:[REDACTED:assignment] https://h',
    'curl --user=alice:hunter22 https://h': 'curl --user=alice:[REDACTED:assignment] https://h',
    'curl -u "alice:hunter22" https://h': 'curl -u "alice:[REDACTED:assignment]" https://h',
    'curl -u alice:hun,ter;22 https://h': 'curl -u alice:[REDACTED:assignment] https://h',
    'curl -u "alice:hunter 22" https://h': 'curl -u "alice:[REDACTED:assignment]" https://h',
    "curl --user 'alice:hunter 22' https://h": "curl --user 'alice:[REDACTED:assignment]' https://h",
  };
  for (const [input, expected] of Object.entries(cases)) {
    assert.equal(redact(input, {}), expected, input);
    assert.equal(redact(expected, {}), expected, `idempotent: ${expected}`);
  }
  for (const input of ['curl -u alice https://h', 'git push -u origin main', 'curl -s https://h:8080/x; ls -u a:b']) assert.equal(redact(input, {}), input);
});

test('mysql -pSECRET is redacted only for mysql, mariadb and mysqldump', () => {
  const cases = {
    'mysql -pSECRET123 db': 'mysql -p[REDACTED:assignment] db',
    'mysql -u root -pSECRET123 db': 'mysql -u root -p[REDACTED:assignment] db',
    'mariadb -h h -pSECRET123': 'mariadb -h h -p[REDACTED:assignment]',
    'mysqldump -uroot -pSECRET123 db > out.sql': 'mysqldump -uroot -p[REDACTED:assignment] db > out.sql',
    "mysql -p'sec ret' db": 'mysql -p[REDACTED:assignment] db',
  };
  for (const [input, expected] of Object.entries(cases)) {
    assert.equal(redact(input, {}), expected, input);
    assert.equal(redact(expected, {}), expected, `idempotent: ${expected}`);
  }
  for (const input of ['mkdir -p dir', 'mkdir -pv dir', 'git -p log', 'mysql -p db', 'mysql -p', 'mysql -e x; mkdir -pfoo', 'mysql --port=3306 -h h', 'ls -pSECRET']) {
    assert.equal(redact(input, {}), input);
  }
});

test('the glued-pass, pwd flag, curl -u and mysql -p patterns stay linear on 100 KB input', () => {
  const rep = (unit) => unit.repeat(Math.ceil(100_000 / unit.length));
  const inputs = {
    gluedNames: `${rep('dbpass')}:x`,
    gluedUpper: rep('DBPASS'),
    gluedSpaces: `dbpass${' '.repeat(100_000)}`,
    pwdFlags: rep('--pwd '),
    pwdDashes: `--${rep('db-pwd-')}`,
    pwdSpaces: `--pwd${' '.repeat(100_000)}`,
    camelFlags: rep('--dbPass '),
    curlRepeat: rep('curl '),
    curlFlags: rep('curl -u '),
    curlTokens: `curl${rep(' a')}`,
    curlSpaces: `curl${' '.repeat(100_000)}`,
    curlColons: `curl -u ${rep('a:')}`,
    mysqlRepeat: rep('mysql '),
    mysqlFlags: rep('mysql -p'),
    mysqlTokens: `mysql${rep(' -x')}`,
    mysqlSpaces: `mysql${' '.repeat(100_000)}`,
    mysqldump: rep('mysqldump -u '),
  };
  redact('warm up curl -u a:b mysql -pX --pwd y dbpass=z', {});
  for (const [name, input] of Object.entries(inputs)) {
    const start = performance.now();
    redact(input, {});
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 50, `${name} took ${elapsed} ms`);
  }
});

test('a value that is exactly one marker is not redacted twice', () => {
  const once = redact('{"DB_PASSWORD": "x1234567"} password=hunter2xx, token=abcdef123456;', {});
  assert.equal(once, '{"DB_PASSWORD": [REDACTED:assignment]} password=[REDACTED:assignment], token=[REDACTED:assignment];');
  assert.equal(redact(once, {}), once);
  for (const input of ['{"password":"hunter2xx"}', 'password=abc}', '{"password": hunter}', 'x --token=abcdef12 y']) {
    assert.equal(redact(redact(input, {}), {}), redact(input, {}), input);
  }
});

test('redacts every string leaf under a secret-looking key and credential-like keys', () => {
  const repo = tempRepo();
  ensureExcluded(repo);
  appendEvent(repo, 'r-1', {
    type: 'x',
    headers: { Authorization: 'Basic dXNlcjpwYXNzd29yZA==', Cookie: 'sid=abcdef123456' },
    credentials: 'plainsecret1',
    passwords: ['x1234567'],
    secrets: { db: 'y7654321', deep: { more: ['z1111111'] } },
    count: 3,
  }, {});
  const raw = fs.readFileSync(runFile(repo, 'r-1'), 'utf8');
  for (const value of ['dXNlcjpwYXNzd29yZA==', 'abcdef123456', 'plainsecret1', 'x1234567', 'y7654321', 'z1111111']) {
    assert.equal(raw.includes(value), false, value);
  }
  const [event] = readEvents(repo, 'r-1');
  assert.deepEqual(event.passwords, ['[REDACTED:assignment]']);
  assert.equal(event.secrets.deep.more[0], '[REDACTED:assignment]');
  assert.equal(event.count, 3);
});

test('redaction stays linear on pathological input', () => {
  const inputs = { 'a-': 'a-'.repeat(100_000), dashes: '-'.repeat(200_000), word: 'a'.repeat(200_000), 'A_': 'A_'.repeat(100_000), 'a:/': 'a://'.repeat(50_000) };
  for (const unit of ['APIKEY', 'SECRET_TOKEN_', 'API_KEY', 'PASSWORD', 'PASSWORD_', 'PRIVATE_KEY', 'password_', 'my_token_']) {
    inputs[unit] = unit.repeat(Math.ceil(200_000 / unit.length));
  }
  for (const [name, input] of Object.entries(inputs)) {
    const start = performance.now();
    redact(input, {});
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 200, `${name} took ${elapsed} ms`);
  }
});

test('listRuns skips stray files that are not run ids', () => {
  const repo = tempRepo();
  ensureExcluded(repo);
  appendEvent(repo, 'r-2', { type: 'x' });
  appendEvent(repo, 'r-1', { type: 'x' });
  fs.writeFileSync(path.join(runsDir(repo), 'notes.jsonl'), '');
  fs.writeFileSync(path.join(runsDir(repo), 'r-bad name.jsonl'), '');
  fs.writeFileSync(path.join(runsDir(repo), 'readme.txt'), '');
  assert.deepEqual(listRuns(repo), ['r-1', 'r-2']);
});

test('setCurrentRun rejects an invalid run id', () => {
  const repo = tempRepo();
  ensureExcluded(repo);
  assert.throws(() => setCurrentRun(repo, '../x'), TraceError);
  assert.equal(fs.existsSync(path.join(hidkitDir(repo), 'current-run')), false);
});

test('writeSecure refuses a symlinked directory under .hidkit', () => {
  const repo = tempRepo();
  ensureExcluded(repo);
  const outside = `${repo}-outside`;
  fs.mkdirSync(outside);
  fs.chmodSync(outside, 0o755);
  fs.mkdirSync(hidkitDir(repo));
  fs.symlinkSync(outside, runsDir(repo));
  assert.throws(() => writeSecure(repo, runFile(repo, 'r-1'), 'x\n'), TraceError);
  assert.deepEqual(fs.readdirSync(outside), []);
  assert.equal(fs.statSync(outside).mode & 0o777, 0o755);
});
