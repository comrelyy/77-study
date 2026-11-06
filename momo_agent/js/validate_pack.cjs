// Usage: node validate_pack.cjs <pack.json> <staticRoot> [--audit <manifest.json>] [--real-scenes] [--staged <dir>]
// Runs the project's own validator (and optionally the content audit) and prints {"errors":[],"warnings":[]}.
const fs = require('node:fs'), path = require('node:path');
const repo = path.join(__dirname, '..', '..');
const { validate } = require(path.join(repo, 'static', 'core', 'model.js'));
const { auditPack } = require(path.join(repo, 'content-audit.cjs'));

const [packFile, realRoot, ...flags] = process.argv.slice(2);
const pack = JSON.parse(fs.readFileSync(packFile, 'utf8'));
// --staged <dir>: files not yet moved into static/ sit in <dir>; show the validator both trees as one.
// The theme's old audio folder is replaced as a whole, so it is left out of the view.
const oldAudio = path.join(realRoot, 'audio', pack.sceneId);
const stagedAt = flags.indexOf('--staged');
function mergeTrees(real, staged, out) {
  fs.mkdirSync(out, { recursive: true });
  const names = new Set([...(fs.existsSync(real) ? fs.readdirSync(real) : []), ...fs.readdirSync(staged)]);
  for (const name of names) {
    const r = path.join(real, name), s = path.join(staged, name);
    if (r === oldAudio && fs.existsSync(s)) fs.symlinkSync(s, path.join(out, name));
    else if (fs.existsSync(r) && fs.existsSync(s) && fs.statSync(r).isDirectory() && fs.statSync(s).isDirectory()) mergeTrees(r, s, path.join(out, name));
    else fs.symlinkSync(fs.existsSync(s) ? s : r, path.join(out, name));
  }
}
const mergedDir = stagedAt >= 0 ? fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'momo-merged-')) : null;
if (mergedDir) mergeTrees(realRoot, flags[stagedAt + 1], mergedDir);
const staticRoot = mergedDir || realRoot;
const auditAt = flags.indexOf('--audit');
// Unless --real-scenes is given, scene pictures are made later, so this theme's own scene images count as present.
const ownScene = flags.includes('--real-scenes') ? /$^/ : new RegExp('^illustrations/scenes/' + pack.sceneId + '-.*\\.svg$');
const exists = file => ownScene.test(file) || fs.existsSync(path.join(staticRoot, file));

const result = validate(pack, { exists });
if (auditAt >= 0) {
  const manifest = JSON.parse(fs.readFileSync(flags[auditAt + 1], 'utf8'));
  result.errors.push(...auditPack(pack, manifest, { staticRoot }).errors);
}
if (mergedDir) fs.rmSync(mergedDir, { recursive: true });
console.log(JSON.stringify({ errors: result.errors, warnings: result.warnings }));
