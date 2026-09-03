/*
 * docs/ 의 시안 원본을 건드리지 않고 배포용 index.html 을 만든다.
 *
 * 원본은 <!doctype> 도 <head> 도 없는 조각이다 — 준용 로컬에서 더블클릭으로 열리게
 * 만든 것이라 브라우저의 암묵 파싱에 기대고 있다. 그대로 올려도 열리기는 하지만
 * viewport 가 없어서 폰에서 @media (max-width:880px) 분기가 안 걸린다.
 * 콜드메일 링크는 대부분 폰에서 열리므로 여기서 최소한의 머리만 붙여 준다.
 *
 * 시안 자체가 기준 파일이다. 내용을 고칠 일이 있으면 docs/ 쪽을 고친다.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const SRC = 'docs/시안-캠페인콘솔-20260903.html'
const OUT = 'dist'

const head = [
  '<!doctype html>',
  '<html lang="ko">',
  '<meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width,initial-scale=1">',
  /* 실 클라이언트명이 박힌 화면이라 검색 노출만 막는다. 링크 접근은 공개다. */
  '<meta name="robots" content="noindex,nofollow">',
  '',
].join('\n')

const body = await readFile(SRC, 'utf8')
await mkdir(OUT, { recursive: true })
await writeFile(`${OUT}/index.html`, head + body, 'utf8')
console.log(`dist/index.html — ${(head + body).length} bytes`)
