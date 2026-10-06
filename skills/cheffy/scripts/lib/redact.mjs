export const MIN_ENV_VALUE_LENGTH = 8;

const PATTERNS = [
  ['private-key', /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g],
  ['aws-key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g],
  ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{22,255})\b/g],
  ['slack-token', /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g],
  ['jwt', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g],
  ['api-key', /\bsk-(?:ant-)?[A-Za-z0-9_-]{20,}\b/g],
  ['bearer', /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/g],
];
const BASIC_AUTH = /(\bAuthorization["']?\s*[:=]\s*["']?)Basic\s+[A-Za-z0-9+/=]{8,}/gi;
const URL_CREDENTIAL = /((?<![a-z0-9+.-])[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)[^\s/]+(?=@)/gi;
// The lookahead skips only a value that is exactly one finished marker, so a later pass does not re-consume it.
// A marker with anything glued on (a secret's unmatched tail) is still redacted whole.
// A quoted value takes any tail glued to its closing quote, so `"abc"def` leaves nothing behind.
const VALUE_SOURCE = String.raw`(?!\[REDACTED:[a-z-]+\](?=[\s,;]|$))("[^"]*"[^\s,;]*|'[^']*'[^\s,;]*|[^\s,;]+)`;
// Assignments scan one whole identifier at a time (no keyword inside the regex), which keeps matching linear.
// The separator takes any horizontal space, such as a no-break space, but never a line break.
// So an empty value cannot swallow the key on the next line.
const ASSIGNMENT_KEY = /(?<!\w)(\w+)(["']?)([^\S\r\n\u2028\u2029]*[:=][^\S\r\n\u2028\u2029]*)/g;
const ASSIGNMENT_VALUE = new RegExp(VALUE_SOURCE, 'y');
const UPPER_SECRET_NAME = /PASSWORD|PASSWD|PASSPHRASE|SECRET|TOKEN|API_?KEY|PRIVATE_KEY|(?:^|_)(?:PASS|PWD)$/;
const SECRET_NAME_END = /(?:password|passwd|passphrase|secret|api_?key|apikey|access_token|auth_token|client_secret|token|(?:^|_)(?:pass|pwd))$/i;
// The shell sets these to directories. They end in PWD but hold no secret.
const SHELL_DIR_NAMES = new Set(['PWD', 'OLDPWD']);
// A camelCase name such as dbPass or userPwd. Case-sensitive, so compass and bypass stay clear.
const CAMEL_SECRET_NAME = /[a-z0-9](?:Pass|Pwd)$/;
// A pass or pwd glued to a known service prefix with no separator, such as dbpass or PGPASS.
// The prefix list keeps bypass, compass and surpass clear.
const GLUED_PREFIXES = 'db|pg|sql|mysql|mariadb|pgsql|postgres|postgresql|mongo|redis|smtp|ftp|ssh|ldap|admin|root|user';
const GLUED_SECRET_NAME = new RegExp(`(?:${GLUED_PREFIXES})(?:pass|pwd)$`, 'i');
// A bare pass flag needs a dash or an underscore before it, so --bypass stays clear.
const CLI_FLAG = new RegExp(String.raw`((?<![\w-])--[\w-]*(?:password|passwd|passphrase|secret|token|api-?key|pwd|(?<=[-_])pass|(?:${GLUED_PREFIXES})pass))(\s+|=)${VALUE_SOURCE}`, 'gi');
// A camelCase flag such as --userPass. Case-sensitive, so --bypass stays clear.
const CAMEL_CLI_FLAG = new RegExp(String.raw`((?<![\w-])--[\w-]*[a-z0-9]Pass)(\s+|=)${VALUE_SOURCE}`, 'g');
// A value for curl -u or mysql -p. It takes a quoted value and its glued tail, or the rest of the token.
const TOKEN_VALUE = String.raw`(?!\[REDACTED:[a-z-]+\]["']?(?=\s|$))("[^"]*"\S*|'[^']*'\S*|\S+)`;
// The command word, then at most 40 tokens that stay inside one command (no pipe, semicolon or ampersand).
// The count is bounded and each token cannot hold a space, so matching stays linear.
const CURL_USER = new RegExp(String.raw`(\bcurl(?:\s+[^\s|;&]+){0,40}?\s+(?:--user(?:\s+|=)|-u\s*)["']?[^\s:"']*:)${TOKEN_VALUE}`, 'g');
// A quoted credential can hold spaces: redact up to the closing quote, before the unquoted form runs.
const CURL_USER_QUOTED = new RegExp(String.raw`(\bcurl(?:\s+[^\s|;&]+){0,40}?\s+(?:--user(?:\s+|=)|-u\s*)(["'])[^\s:"']*:)(?!\[REDACTED:)[^"'\n]*(?=\2)`, 'g');
const MYSQL_PASSWORD = new RegExp(String.raw`((?<![\w.-])(?:mysqldump|mysql|mariadb)(?:\s+[^\s|;&]+){0,40}?\s+-p)(?=[^\s-])${TOKEN_VALUE}`, 'g');
const SECRET_ENV_NAME = /SECRET|TOKEN|KEY|PASSWORD/i;

function isSecretName(name) {
  if (SHELL_DIR_NAMES.has(name)) return false;
  return (name === name.toUpperCase() && UPPER_SECRET_NAME.test(name)) || SECRET_NAME_END.test(name) || CAMEL_SECRET_NAME.test(name) || GLUED_SECRET_NAME.test(name);
}

function redactAssignments(text) {
  let out = '';
  let last = 0;
  ASSIGNMENT_KEY.lastIndex = 0;
  for (let key = ASSIGNMENT_KEY.exec(text); key; key = ASSIGNMENT_KEY.exec(text)) {
    if (!isSecretName(key[1])) continue;
    const start = key.index + key[0].length;
    ASSIGNMENT_VALUE.lastIndex = start;
    const value = ASSIGNMENT_VALUE.exec(text);
    if (!value) continue;
    // After a quoted key (JSON) a value gives back its closing braces, so a redacted object keeps its shape.
    let keep = value[0].length;
    if (key[2]) while (keep > 0 && value[0][keep - 1] === '}') keep -= 1;
    out += `${text.slice(last, start)}[REDACTED:assignment]${value[0].slice(keep)}`;
    last = start + value[0].length;
    ASSIGNMENT_KEY.lastIndex = last;
  }
  return out + text.slice(last);
}

export function redact(text, env = process.env) {
  let out = text;
  for (const [name, value] of Object.entries(env)) {
    if (SECRET_ENV_NAME.test(name) && typeof value === 'string' && value.length >= MIN_ENV_VALUE_LENGTH) {
      out = out.split(value).join('[REDACTED:env]');
    }
  }
  for (const [kind, pattern] of PATTERNS) out = out.replace(pattern, `[REDACTED:${kind}]`);
  out = out.replace(BASIC_AUTH, '$1[REDACTED:basic]').replace(URL_CREDENTIAL, '$1[REDACTED:url-credential]');
  const flag = (_, head, separator) => `${head}${separator}[REDACTED:assignment]`;
  return redactAssignments(out)
    .replace(CLI_FLAG, flag)
    .replace(CAMEL_CLI_FLAG, flag)
    .replace(CURL_USER_QUOTED, '$1[REDACTED:assignment]')
    .replace(CURL_USER, '$1[REDACTED:assignment]')
    .replace(MYSQL_PASSWORD, '$1[REDACTED:assignment]');
}
