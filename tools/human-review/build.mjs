// docs/project/HUMAN_REVIEW.md 를 읽어 오너 확인용 HTML 페이지를 만든다.
// 정본은 계속 HUMAN_REVIEW.md 다. 이 페이지는 보기 쉬운 사본이며, 문서를 고친 뒤 다시 실행한다.
//
//   node tools/human-review/build.mjs [출력 경로]   (기본: .review/human-review.html)

import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const sourcePath = resolve(root, 'docs/project/HUMAN_REVIEW.md');
const templatePath = resolve(here, 'template.html');
const outPath = resolve(root, process.argv[2] ?? '.review/human-review.html');
const repoBlob = 'https://github.com/seniya/game-town-builder/blob/main/docs/project/';

/**
 * 마크다운 표의 한 줄을 셀 배열로 나눈다. 셀 안에 `|` 는 쓰지 않는다는 문서 관례에 기댄다.
 * @param {string} line 표의 한 줄
 * @returns {string[]} 앞뒤 공백을 걷어 낸 셀
 */
function splitRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

/**
 * 제목(`## `)으로 시작하는 절의 본문 줄을 돌려준다.
 * @param {string[]} lines 문서 전체 줄
 * @param {string} prefix 절 제목의 앞부분 (예: '## 3.')
 * @returns {string[]} 다음 `## ` 제목 전까지의 줄
 */
function sectionLines(lines, prefix) {
  const start = lines.findIndex((l) => l.startsWith(prefix));
  if (start < 0) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith('## '));
  return end < 0 ? rest : rest.slice(0, end);
}

/**
 * 절 안의 HR 표 행을 항목 객체로 바꾼다.
 * @param {string[]} lines 절 본문
 * @returns {{id:string, source:string, scene:string, checks:string, status:string, result:string}[]} 항목
 */
function parseItems(lines) {
  return lines
    .filter((l) => /^\|\s*HR-\d+/.test(l))
    .map((l) => {
      const [id, source, scene, checks, status, result] = splitRow(l);
      return { id, source, scene, checks, status, result: result ?? '' };
    });
}

/**
 * 게이트(재미 검증 G1/G2, 확장 미술 V1 등)의 제목과 상태를 읽는다.
 * @param {string[]} lines 4 절 본문
 * @returns {{name:string, status:string}[]} 게이트 요약
 */
function parseGates(lines) {
  return lines
    .filter((l) => l.startsWith('### G') || l.startsWith('### V'))
    .map((l) => {
      const [name, status = ''] = l.replace(/^###\s*/, '').split(/\s+—\s+상태:\s*/);
      return { name, status };
    });
}

/**
 * 현재 커밋의 짧은 해시를 돌려준다. git 이 없으면 빈 문자열.
 * @returns {string} 커밋 해시
 */
function currentCommit() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim();
  } catch {
    return '';
  }
}

const lines = readFileSync(sourcePath, 'utf8').split('\n');
const data = {
  generatedAt: new Date().toISOString(),
  commit: currentCommit(),
  repoBlob,
  pending: parseItems(sectionLines(lines, '## 3.')),
  done: parseItems(sectionLines(lines, '## 5.')),
  gates: parseGates(sectionLines(lines, '## 4.')),
};

// </script> 가 문서 안에 들어와도 JSON 블록이 끊기지 않게 < 를 이스케이프한다.
const json = JSON.stringify(data).replace(/</g, '\\u003c');
const html = readFileSync(templatePath, 'utf8').replace('"__HR_DATA__"', json);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, html);
console.log(
  `[human-review] ${outPath} — 대기 ${data.pending.length}, 완료 ${data.done.length}, 게이트 ${data.gates.length}`,
);
