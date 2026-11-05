const fs = require('fs'), vm = require('vm'), assert = require('assert');
const source = fs.readFileSync(__dirname + '/static/theme.js', 'utf8');
async function fixture(sessionSeconds, dailySeconds) {
  let tick, now = 100000;
  const nodes = new Map(), events = [], storage = new Map([['picnicSeconds', String(sessionSeconds)]]);
  const context = {
    console, Math, Date: {now: () => now}, crypto: {randomUUID: () => String(events.length)},
    sessionStorage: {getItem: k => storage.get(k), setItem: (k,v) => storage.set(k,String(v))},
    document: {hidden: false, addEventListener() {}, querySelector(k) {
      if (!nodes.has(k)) nodes.set(k, {innerHTML: ''});
      return nodes.get(k);
    }}, window: {}, setInterval(fn) {tick = fn},
    fetch: async (path, options) => ({ok: true, json: async () => {
      if (!options?.body) return {seconds: dailySeconds, events: []};
      if (path.endsWith('/event')) events.push(JSON.parse(options.body));
      return {ok: true};
    }})
  };
  vm.createContext(context);vm.runInContext(source, context);
  await new Promise(r => setImmediate(r));
  return {run: s => vm.runInContext(s,context), events, storage,
    tick: async () => {now += 1000; await tick()}};
}
(async () => {
  const f = await fixture(465, 885);
  f.run('openChapter(0)'); await f.tick();
  assert.equal(f.run('screen'), 'theme');
  assert.equal(f.run('step'), 0);
  await f.run('endTheme()');
  assert.equal(f.storage.get('picnicSeconds'), '0');
  f.run('home();openChapter(0)'); await f.tick();
  assert.equal(f.run('screen'), 'theme');
  const limit = await fixture(479, 0);
  limit.run('openChapter(0)'); await limit.tick();
  assert.equal(limit.run('screen'), 'end');
  assert.equal(limit.events.at(-1).payload.reason, 'session_limit');
  const daily = await fixture(0, 899);
  daily.run('openChapter(0)'); await daily.tick();
  assert.equal(daily.events.at(-1).payload.reason, 'daily_limit');
  daily.run('home();openChapter(0)');
  assert.equal(daily.run('screen'), 'rest');
  console.log('PASS: near-limit entry, session reset and restart, exact session/daily limits');
})().catch(e => {console.error(e);process.exitCode=1});

