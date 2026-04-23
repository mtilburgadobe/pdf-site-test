#!/usr/bin/env node
/**
 * Convert rendered EDS HTML (in /workspace/repos/content/*.html) into DA-style
 * .plain.html files alongside them.
 *
 * The `.plain.html` format (per the generate-import-html skill):
 *   - A sequence of top-level `<div>` sections (no <html>/<head>/<body>/<main>)
 *   - Blocks expressed as `<div class="blockname"><div><div>cell</div>...</div></div>`
 *   - Section variants expressed via `<div class="section-metadata">` inside the section
 *   - Page metadata expressed via `<div class="metadata">` appended as a final section
 *   - Nav/footer fragments are plain section divs, no metadata block.
 *
 * This is the format admin.da.live expects on upload.  DA stores it and
 * `<site>.aem.page/<path>.plain.html` serves it back for EDS decoration.
 */
const fs = require('fs');
const path = require('path');

function resolveModule(name) {
  const candidates = [
    path.resolve('/home/node/.excat-marketplace/excat/skills/excat-content-import/scripts/node_modules', name),
    path.resolve('/home/node/.excat-marketplace/excat/tools/excatops-mcp/node_modules', name),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return name;
}

const { JSDOM } = require(resolveModule('jsdom'));

const SRC_DIR = '/workspace/repos/content';

/** Collect direct-child nodes of `el`, skipping whitespace-only text nodes. */
function childNodes(el) {
  return Array.from(el.childNodes).filter((n) => {
    if (n.nodeType === 3 && !n.textContent.trim()) return false;
    return true;
  });
}

function createDiv(doc) { return doc.createElement('div'); }

/** Convert hero block - flatten outer wrappers so content becomes a single cell. */
function convertHero(doc, hero) {
  const contentNodes = [];
  for (const child of Array.from(hero.children)) {
    if (child.tagName === 'PICTURE') {
      contentNodes.push(child);
    } else if (child.tagName === 'DIV') {
      let inner = child;
      while (inner.tagName === 'DIV'
             && inner.children.length === 1
             && inner.firstElementChild.tagName === 'DIV') {
        inner = inner.firstElementChild;
      }
      for (const n of childNodes(inner)) contentNodes.push(n);
    }
  }
  const block = createDiv(doc);
  block.className = 'hero';
  const row = createDiv(doc);
  const cell = createDiv(doc);
  contentNodes.forEach((n) => cell.appendChild(n));
  row.appendChild(cell);
  block.appendChild(row);
  hero.replaceWith(block);
}

/** Cards block - leave structure intact but strip extraneous whitespace. */
function convertCards(doc, cards) {
  const block = createDiv(doc);
  block.className = 'cards';
  for (const rowDiv of Array.from(cards.children)) {
    const row = createDiv(doc);
    for (const cellDiv of Array.from(rowDiv.children)) {
      const cell = createDiv(doc);
      childNodes(cellDiv).forEach((n) => cell.appendChild(n));
      row.appendChild(cell);
    }
    if (!row.firstElementChild) {
      // row with direct content (no nested cell divs)
      const cell = createDiv(doc);
      childNodes(rowDiv).forEach((n) => cell.appendChild(n));
      row.appendChild(cell);
    }
    block.appendChild(row);
  }
  cards.replaceWith(block);
}

/** Columns block - same flat row/cell structure. */
function convertColumns(doc, cols) {
  const block = createDiv(doc);
  block.className = 'columns';
  for (const rowDiv of Array.from(cols.children)) {
    const row = createDiv(doc);
    for (const cellDiv of Array.from(rowDiv.children)) {
      const cell = createDiv(doc);
      childNodes(cellDiv).forEach((n) => cell.appendChild(n));
      row.appendChild(cell);
    }
    block.appendChild(row);
  }
  cols.replaceWith(block);
}

function buildSectionMetadata(doc, variant) {
  const block = createDiv(doc);
  block.className = 'section-metadata';
  const row = createDiv(doc);
  const k = createDiv(doc);
  k.textContent = 'style';
  const v = createDiv(doc);
  v.textContent = variant;
  row.appendChild(k);
  row.appendChild(v);
  block.appendChild(row);
  return block;
}

function buildMetadata(doc, head) {
  const rows = [];
  const title = head.querySelector('title');
  if (title && title.textContent.trim()) rows.push(['title', title.textContent.trim()]);
  const desc = head.querySelector('meta[name="description"]');
  if (desc && desc.getAttribute('content')) rows.push(['description', desc.getAttribute('content')]);
  const nav = head.querySelector('meta[name="nav"]');
  if (nav && nav.getAttribute('content')) rows.push(['nav', nav.getAttribute('content')]);
  const footer = head.querySelector('meta[name="footer"]');
  if (footer && footer.getAttribute('content')) rows.push(['footer', footer.getAttribute('content')]);
  if (!rows.length) return null;
  const block = createDiv(doc);
  block.className = 'metadata';
  for (const [k, v] of rows) {
    const row = createDiv(doc);
    const kd = createDiv(doc);
    kd.textContent = k;
    const vd = createDiv(doc);
    vd.textContent = v;
    row.appendChild(kd);
    row.appendChild(vd);
    block.appendChild(row);
  }
  return block;
}

function convertPage(srcPath, outPath, { addMetadata }) {
  const html = fs.readFileSync(srcPath, 'utf-8');
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const main = doc.querySelector('main') || doc.body;

  // Convert blocks bottom-up to avoid re-processing
  doc.querySelectorAll('div.hero').forEach((d) => convertHero(doc, d));
  doc.querySelectorAll('div.cards').forEach((d) => convertCards(doc, d));
  doc.querySelectorAll('div.columns').forEach((d) => convertColumns(doc, d));

  // Build output: one top-level div per section, with optional section-metadata
  const out = [];
  const topDivs = Array.from(main.children).filter((c) => c.tagName === 'DIV');
  for (const section of topDivs) {
    const sectionDiv = createDiv(doc);
    const classes = Array.from(section.classList || []);
    const variants = classes.filter((c) => c !== 'section');
    if (classes.includes('section') && variants.length) {
      sectionDiv.appendChild(buildSectionMetadata(doc, variants.join(', ')));
    }
    // Move section children into sectionDiv
    for (const n of childNodes(section)) sectionDiv.appendChild(n);
    out.push(sectionDiv);
  }

  if (addMetadata) {
    const metaBlock = buildMetadata(doc, doc.head);
    if (metaBlock) {
      const metaSection = createDiv(doc);
      metaSection.appendChild(metaBlock);
      out.push(metaSection);
    }
  }

  // Serialize
  const serialized = out.map((n) => n.outerHTML).join('\n');
  fs.writeFileSync(outPath, serialized, 'utf-8');
  return { sections: out.length, bytes: serialized.length };
}

function main() {
  const files = fs.readdirSync(SRC_DIR).filter((f) => f.endsWith('.html') && !f.endsWith('.plain.html'));
  for (const file of files) {
    const src = path.join(SRC_DIR, file);
    const base = file.replace(/\.html$/, '');
    const out = path.join(SRC_DIR, `${base}.plain.html`);
    const isFragment = base === 'nav' || base === 'footer';
    try {
      const stats = convertPage(src, out, { addMetadata: !isFragment });
      console.log(`${file} -> ${base}.plain.html (sections=${stats.sections}, ${stats.bytes}B)`);
    } catch (err) {
      console.error(`FAILED ${file}: ${err.message}`);
    }
  }
}

main();
