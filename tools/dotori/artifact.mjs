// 도토리 마을 빌드(dist/)에서 아티팩트로 게시할 파일만 모은다.
// 사용: pnpm vite build && node tools/dotori/artifact.mjs <출력 폴더>
// - 아티팩트는 게시할 때 <!doctype>·<html>·<head>·<body> 틀을 씌우므로 페이지에서 그 태그를 뺀다.
// - 페이지가 참조하는 JS·CSS 와 public/dotori/assets 의 모델(glTF JSON)을 같은 상대 경로로 옮긴다.
import fs from 'node:fs';
import path from 'node:path';

const out = process.argv[2];
if (!out) throw new Error('출력 폴더를 주세요');
const dist = path.resolve('dist');
let html = fs.readFileSync(path.join(dist, 'dotori.html'), 'utf8');
html = html
  .replace(/<!doctype html>/i, '')
  .replace(/<\/?html[^>]*>/gi, '')
  .replace(/<\/?head>/gi, '')
  .replace(/<\/?body>/gi, '')
  .replace(/<meta charset="UTF-8" \/>/i, '')
  .replace(/<meta name="viewport"[^>]*>/i, '')
  .trim();
// <title> 을 맨 앞에 둔다(앞 8KB 안에서만 찾는다).
const title = html.match(/<title>.*?<\/title>/)?.[0] ?? '<title>도토리 마을</title>';
html = `${title}\n${html.replace(title, '')}`;
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'assets'), { recursive: true });
fs.writeFileSync(path.join(out, 'index.html'), html);
const refs = new Set([...html.matchAll(/(?:src|href)="\.\/(assets\/[^"]+)"/g)].map((m) => m[1]));
// JS 가 다시 불러오는 청크도 따라간다.
for (const r of [...refs]) {
  if (!r.endsWith('.js')) continue;
  const js = fs.readFileSync(path.join(dist, r), 'utf8');
  for (const m of js.matchAll(/["'`]\.\/([\w.-]+\.js)["'`]/g)) refs.add(`assets/${m[1]}`);
}
for (const r of refs) fs.copyFileSync(path.join(dist, r), path.join(out, r));
fs.cpSync(path.join(dist, 'dotori', 'assets'), path.join(out, 'dotori', 'assets'), { recursive: true });
const files = [...refs, ...fs.readdirSync(path.join(out, 'dotori', 'assets')).map((f) => `dotori/assets/${f}`)];
fs.writeFileSync(path.join(out, 'files.json'), JSON.stringify(Object.fromEntries(files.map((f) => [f, f])), null, 1));
console.log(`index.html + ${files.length} 개 → ${out}`);
