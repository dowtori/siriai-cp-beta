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

/* 두 화면이다. 브랜드가 링크로 여는 콘솔과, 우리가 캠페인을 굴리는 어드민.
   어드민은 /admin 으로 나간다 — 같은 배포 안에 두면 서로를 링크할 수 있다. */
const PAGES = [
  { src: 'docs/시안-워크스페이스-20260904.html', out: 'index.html',       title: '브랜드 워크스페이스', path: '/' },
  { src: 'docs/어드민-캠페인운영-20260907.html', out: 'admin/index.html', title: '캠페인 어드민',      path: '/admin' },
]
const OUT = 'dist'

/* ── 계측 ────────────────────────────────────────────────────────────
 * 전달받은 공개 GA4 측정 ID는 운영 배포의 기본값으로 사용한다.
 * 로컬·프리뷰에서는 GA4_ID를 명시한 경우에만 붙여서 검증 트래픽을 섞지 않는다.
 *
 *   GA4_ID        G-XXXXXXXXXX
 *   BEUSABLE_SRC  뷰저블 대시보드가 주는 스크립트 주소 그대로
 *                 (//rum.beusable.net/script/… 형태. 키 형식을 추측하지 않으려고 통째로 받는다)
 *
 * 두 화면은 page_title 로 구분하고, 경로는 실제로 열린 주소를 기록한다.
 * /oddtype/2026-08 도 index.html 을 쓰므로 page.path('/')를 보내면 안 된다.
 */
const GA4 = (process.env.GA4_ID ?? (process.env.VERCEL_ENV === 'production' ? 'G-S0JCCGC2SB' : '')).trim()
const BEU = (process.env.BEUSABLE_SRC || '').trim()

if (GA4 && !/^G-[A-Z0-9]+$/.test(GA4)) {
  throw new Error('GA4_ID에는 스크립트 전체가 아닌 G-로 시작하는 측정 ID를 넣어 주세요.')
}

function analytics(page) {
  const out = []
  if (GA4) {
    out.push(
      `<script async src="https://www.googletagmanager.com/gtag/js?id=${GA4}"></script>`,
      '<script>',
      '  window.dataLayer = window.dataLayer || [];',
      '  function gtag(){dataLayer.push(arguments)}',
      "  gtag('js', new Date());",
      `  gtag('config', '${GA4}', { page_title: ${JSON.stringify(page.title)}, page_path: location.pathname + location.search });`,
      '</script>',
    )
  }
  if (BEU) {
    out.push(
      '<script>',
      '(function(w, d, a){',
      '  w.__beusablerumclient__ = { load: function(src){',
      '    var b = d.createElement("script"); b.src = src; b.async = true; b.type = "text/javascript";',
      '    d.getElementsByTagName("head")[0].appendChild(b);',
      '  } };',
      '  w.__beusablerumclient__.load(a + "?url=" + encodeURIComponent(d.URL));',
      `})(window, document, ${JSON.stringify(BEU)});`,
      '</script>',
    )
  }
  return out.length ? out.join('\n') + '\n' : ''
}

function headFor(page) {
  return [
    '<!doctype html>',
    '<html lang="ko">',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    /* 실 클라이언트명이 박힌 화면이라 검색 노출만 막는다. 링크 접근은 공개다. */
    '<meta name="robots" content="noindex,nofollow">',
    '',
  ].join('\n') + analytics(page)
}



/* 스타일과 스크립트가 파싱되는지 본다.
   :root{} 안에 규칙을 하나 잘못 넣어 스타일시트가 통째로 깨진 적이 있는데,
   화면은 그냥 조금 이상해 보일 뿐이라 눈으로는 못 잡는다. */
function checkCss(css) {
  let depth = 0, inRoot = -1;
  const re = /\/\*[\s\S]*?\*\/|[{}]/g;
  let m, lastSel = '';
  const flat = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (let i = 0; i < flat.length; i++) {
    const ch = flat[i];
    if (ch === '{') {
      const sel = flat.slice(0, i).split(/[{}]/).pop().trim();
      if (depth === 1 && inRoot >= 0 && !/^@/.test(sel)) {
        throw new Error(':root 안에 규칙이 들어 있다 -> ' + sel.slice(0, 60));
      }
      if (depth === 0 && /:root/.test(sel)) inRoot = depth;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) inRoot = -1;
    }
  }
  if (depth !== 0) throw new Error('중괄호가 안 맞는다 (depth ' + depth + ')');
}

/* 스크립트도 같다. 따옴표를 하나 안 닫으면 화면은 그냥 아무것도 안 하는
   빈 껍데기가 되는데, 그게 배포까지 조용히 나간 적이 있다. 여기서 끊는다. */
function checkJs(body) {
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g
  let m, n = 0
  while ((m = re.exec(body))) {
    const src = m[1]
    if (!src.trim()) continue
    n++
    try { new Function(src) }
    catch (e) { throw new Error(`${n}번째 <script> 가 안 읽힌다 -> ${e.message}`) }
  }
  return n
}

/* #tbody 는 어드민 표에서 그대로 옮겨 온 선택자였다. 이 화면에 그런 id 가 없어서
   고른 행이 녹색으로 안 칠해졌는데, 화면은 그냥 조용했다.
   반대로 규칙 뭉치를 지우다 옆 것까지 지운 적도 있다. 둘 다 여기서 잡는다. */
function checkIds(body, css) {
  const rest = body.replace(/<style>[\s\S]*?<\/style>/, '')
  const used = new Set()
  const add = re => { for (const m of rest.matchAll(re)) used.add(m[1]) }
  add(/id\s*=\s*["']([A-Za-z][\w-]*)["']/g)          // 마크업과 JS 문자열
  add(/\$\(\s*['"]([A-Za-z][\w-]*)['"]\s*\)/g)      // $('x')
  add(/getElementById\(\s*['"]([A-Za-z][\w-]*)['"]/g)
  add(/querySelector(?:All)?\(\s*['"]#([A-Za-z][\w-]*)/g)

  /* 선택자만 본다 — 여는 중괄호 앞 조각이 선택자다. #f8fafc 같은 색은 안쪽에 있다 */
  const dead = new Set()
  const flat = css.replace(/\/\*[\s\S]*?\*\//g, '')
  for (const part of flat.split(/\}/)) {
    const sel = part.split('{')[0]
    for (const m of sel.matchAll(/#([A-Za-z][\w-]*)/g)) {
      if (!used.has(m[1])) dead.add(m[1])
    }
  }
  if (dead.size) throw new Error('CSS 가 없는 id 를 가리킨다 -> #' + [...dead].join(', #'))
}

for (const page of PAGES) {
  const body = await readFile(page.src, 'utf8')
  const css = (body.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || ''
  try {
    checkCss(css)
    checkJs(body)
    checkIds(body, css)
  } catch (e) {
    throw new Error(`${page.src} — ${e.message}`)
  }
  const dir = page.out.includes('/') ? `${OUT}/${page.out.split('/').slice(0, -1).join('/')}` : OUT
  await mkdir(dir, { recursive: true })
  const html = headFor(page) + body
  await writeFile(`${OUT}/${page.out}`, html, 'utf8')
  console.log(`dist/${page.out} — ${html.length} bytes`)
}

/* 빌드 로그만 봐도 계측이 켜졌는지 알 수 있게 한다.
   조용히 안 붙는 것이 이 종류에서 제일 흔한 사고다. */
console.log(`계측 — GA4 ${GA4 ? GA4 : '없음(미설정)'} · 뷰저블 ${BEU ? '켜짐' : '없음(미설정)'}`)
