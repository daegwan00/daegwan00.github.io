const { Client } = require('@notionhq/client');
const { NotionToMarkdown } = require('notion-to-md');
const { marked } = require('marked');
const fs = require('fs');
const path = require('path');

const notion = new Client({ auth: process.env.NOTION });
const n2m = new NotionToMarkdown({ notionClient: notion });

// 등록한 DB 3개
const DATABASES = [
  { id: process.env.NOTION_DATABASE_ID,        category: 'infra' },
  { id: process.env.NOTION_DATABASE_ID_AWS,    category: 'aws' },
  { id: process.env.NOTION_DATABASE_ID_SYSTEM, category: 'system' },
];

function getOutputDir(category) {
  // ✅ Step 1: 저장 경로를 docs에서 posts로 변경하여 SeoTax 테마 규격에 맞춤
  return path.join(__dirname, `../content/posts/${category}`);
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-가-힣]/g, '')
    .replace(/--+/g, '-');
}

async function getReadyPages(databaseId) {
  try {
    const res = await notion.databases.query({
      database_id: databaseId,
      filter: {
        property: 'status',
        select: { equals: '완료' },
      },
    });
    return res.results;
  } catch (e) {
    console.log(`⏭ DB ${databaseId} 스킵: ${e.message}`);
    return [];
  }
}

async function convertPage(page, category) {
  // 제목 추출
  const titleProp = Object.values(page.properties).find(p => p.type === 'title');
  const title = titleProp?.title[0]?.plain_text ?? 'Untitled';
  const slug = slugify(title);
  const date = new Date().toISOString().split('T')[0];

  // Directory 컬럼 값 (태그로 활용)
  const dirProp = page.properties['Directory'];
  const directory = dirProp?.select?.name ?? category;

  // ✅ Step 2: Notion의 'categories' (다중 선택) 속성 파싱 및 예외 처리(Fallback)
  const catProp = page.properties['categories'];
  let categoriesArray = [category]; // 기본값: DB에 매핑된 카테고리 이름

  if (catProp && catProp.type === 'multi_select' && catProp.multi_select.length > 0) {
    // [{name: "Infra"}] 형태의 객체 배열에서 "Infra" 문자열만 뽑아냄
    categoriesArray = catProp.multi_select.map(c => c.name);
  }
  // 배열을 YAML 호환 포맷의 문자열로 변환 (예: '["Infra", "AWS"]')
  const categoriesString = JSON.stringify(categoriesArray);

  // Notion → Markdown → 파일 저장
  const mdBlocks = await n2m.pageToMarkdown(page.id);
  console.log('블록 샘플:', JSON.stringify(mdBlocks.slice(0,5), null, 2));
  const { parent: mdContent } = n2m.toMarkdownString(mdBlocks);

  // ✅ Step 3: Front Matter에 동적으로 파싱한 카테고리 데이터 주입
  const frontMatter = `---
title: "${title}"
date: ${date}
categories: ${categoriesString}
tags: ["${directory}"]
draft: false
---

`;

  return { slug, content: frontMatter + mdContent, pageId: page.id, title };
}

async function updateStatusPublished(pageId) {
  await notion.pages.update({
    page_id: pageId,
    properties: {
      status: { status: { name: '진행 중' } },
    },
  });
}

async function main() {

  let totalNew = 0;

  for (const db of DATABASES) {
    if (!db.id) continue;
    console.log(`\n📂 DB: ${db.category} (${db.id})`);

    const pages = await getReadyPages(db.id);
    console.log(`  → ${pages.length}개 발행 대기`);

    for (const page of pages) {
      try {
        const { slug, content, pageId, title } = await convertPage(page, db.category);
        const outPutDir = getOutputDir(db.category);
        if (!fs.existsSync(outPutDir)) fs.mkdirSync(outPutDir, { recursive: true });
        const filePath = path.join(outPutDir, `${slug}.md`);
        fs.writeFileSync(filePath, content, 'utf-8');
        console.log(`  ✅ 변환 완료: ${title}`);

        totalNew++;

        // Rate limit 방지
        await new Promise(r => setTimeout(r, 400));
      } catch (e) {
        console.error(`  ❌ 실패: ${e.message}`);
      }
    }
  }

  // GitHub Actions output
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `new_posts=${totalNew}\n`);
  }

  console.log(`\n🎉 총 ${totalNew}개 발행 완료`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
