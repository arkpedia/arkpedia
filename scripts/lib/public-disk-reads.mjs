/**
 * Paths app code builds under public/ on the local disk, and which of them reach for art.
 *
 * Every image under public/ is git-ignored (.gitignore: public/**\/*.webp and the rest): the art
 * lives in the asset repositories, and no machine that exports a content release has a copy.
 * So code that lists or reads art from process.cwd()/public sees nothing there and quietly
 * falls back. lib/events/eventCg.ts did that, and every published event page carried its
 * poster alone while its CG set was published. Art is looked up in the compiled-in asset index
 * instead (lib/assets/publicAssets.ts, data/assets/external-asset-index.json).
 *
 * Generated JSON under public/ (enemies-index.json, planner-data/, lyrics/, stage-guesser/) is
 * written and read by the build on purpose and is not flagged. A path is flagged when:
 * - `art`: its first folder after public/ is one config/asset-folders.json routes to an asset
 *   repository or is named for pictures (…-icons, …-art, cg-…), or any piece of it names an
 *   image file;
 * - `unknown`: what follows public/ is computed (a variable, a call, a template that starts
 *   with an expression) or missing (public/ itself), so nothing says it is not art.
 */
import ts from 'typescript';

const IMAGE = /\.(webp|png|jpe?g|gif|svg|avif|ico)$/i;
/** A folder named for pictures, routed or not (the retired future_operator_icons/ was neither). */
const ART_NAME = /(^|[-_])(icons?|images?|art|posters?|portraits?|skins?|avatars?|banners?|cg|sprites?|chibis?)([-_]|$)/i;
/** Calls that take path pieces: path.join/resolve and the fs functions that touch a path. */
const PATH_CALLS = new Set([
  'join', 'resolve', 'readdirSync', 'readdir', 'readFileSync', 'readFile', 'existsSync', 'statSync', 'stat',
  'lstatSync', 'accessSync', 'access', 'opendirSync', 'opendir', 'createReadStream', 'realpathSync', 'globSync', 'glob',
]);

/** The literal text a string-like argument starts with, and whether all of it is literal. */
function literal(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return { text: node.text, whole: true };
  if (ts.isTemplateExpression(node)) return { text: node.head.text, whole: false };
  return null;
}

function calleeName(expression) {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return null;
}

/**
 * Each path under public/ the source builds, as { line, kind: 'art' | 'unknown', folder, code }.
 * `artFolders` is the set of top-level folders the asset repositories publish.
 */
export function publicDiskReads(source, fileName, artFolders) {
  const kind = /\.tsx$/.test(fileName) ? ts.ScriptKind.TSX : /\.jsx$/.test(fileName) ? ts.ScriptKind.JSX
    : /\.[cm]?js$/.test(fileName) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, kind);
  const findings = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) && PATH_CALLS.has(calleeName(node.expression) ?? '')) {
      const args = node.arguments;
      const at = args.findIndex((arg) => /^(\.\/)?public(\/|$)/.test(literal(arg)?.text ?? ''));
      if (at >= 0) {
        const first = literal(args[at]);
        const after = first.text.replace(/^(\.\/)?public\/?/, '');
        let folder = null;
        let computed = false;
        if (after) folder = after.split('/')[0];
        else if (!first.whole) computed = true;
        else if (at + 1 < args.length) {
          const next = literal(args[at + 1]);
          if (next && next.text) folder = next.text.replace(/^\/+/, '').split('/')[0] || null;
          if (!folder) computed = true;
        } else computed = true;
        const pieces = args.slice(at).map(literal).filter(Boolean);
        const image = pieces.some((piece) => piece.whole && IMAGE.test(piece.text));
        const art = image || (folder !== null && (artFolders.has(folder) || ART_NAME.test(folder)));
        if (art || computed) {
          findings.push({
            line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1,
            kind: art ? 'art' : 'unknown',
            folder,
            code: node.getText(file).replace(/\s+/g, ' ').slice(0, 140),
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return findings;
}

/** The top-level folders config/asset-folders.json routes, plus the two served under other names. */
export function artFoldersFrom(config) {
  return new Set([
    ...Object.entries(config).flatMap(([key, value]) => (key !== 'about' && Array.isArray(value) ? value : [])),
    'skin-originals', 'skin-variants', 'originals', 'variants',
  ]);
}
