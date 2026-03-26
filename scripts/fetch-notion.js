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
  return path.join(__dirname, '../content/docs/${category}'); 
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

  // Notion → Markdown → 파일 저장
  const mdBlocks = await n2m.pageToMarkdown(page.id);
  const { parent: mdContent } = n2m.toMarkdownString(mdBlocks);

  const frontMatter = `---
title: "${title}"
date: ${date}
categories: ["${category}"]
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
        const outPutDir = getOutputDir(category);
        if (!fs.existSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
        const filePath = path.join(outputDir, '${slug}.md');
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
