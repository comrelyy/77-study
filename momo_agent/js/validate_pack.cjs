// Usage: node validate_pack.cjs <pack.json> <staticRoot> [--audit <manifest.json>] [--real-scenes]
// Runs the project's own validator (and optionally the content audit) and prints {"errors":[],"warnings":[]}.
const fs = require('node:fs'), path = require('node:path');
const repo = path.join(__dirname, '..', '..');
const { validate } = require(path.join(repo, 'static', 'core', 'model.js'));
const { auditPack } = require(path.join(repo, 'content-audit.cjs'));

const [packFile, staticRoot, ...flags] = process.argv.slice(2);
const auditAt = flags.indexOf('--audit');
const pack = JSON.parse(fs.readFileSync(packFile, 'utf8'));
// Unless --real-scenes is given, scene pictures are made later, so this theme's own scene images count as present.
const ownScene = flags.includes('--real-scenes') ? /$^/ : new RegExp('^illustrations/scenes/' + pack.sceneId + '-.*\\.svg$');
const exists = file => ownScene.test(file) || fs.existsSync(path.join(staticRoot, file));

const result = validate(pack, { exists });
if (auditAt >= 0) {
  const manifest = JSON.parse(fs.readFileSync(flags[auditAt + 1], 'utf8'));
  result.errors.push(...auditPack(pack, manifest, { staticRoot }).errors);
}
console.log(JSON.stringify({ errors: result.errors, warnings: result.warnings }));
