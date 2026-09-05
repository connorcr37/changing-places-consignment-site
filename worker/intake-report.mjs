import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const fallbackReply = 'Thanks for sending your photos! Can you get the items to the store, or would you need pickup? What timing works best for you?';
const colors = { likely_accept: rgb(0.20, 0.47, 0.33), likely_decline: rgb(0.70, 0.30, 0.23), needs_review: rgb(0.72, 0.54, 0.14) };

export function itemPrices(item) {
  if (item.pricing?.evidence !== 'sufficient' || !item.pricing.basis?.trim()) return [];
  const range = value => value && Number.isInteger(value.low) && Number.isInteger(value.high) && value.low > 0 && value.high > value.low && value.high <= 100000 && value.low % 25 === 0 && value.high % 25 === 0 ? `$${value.low.toLocaleString('en-US')} - $${value.high.toLocaleString('en-US')}` : '';
  const fresh = range(item.pricing.comparable_new), used = range(item.pricing.used_resale);
  return [fresh && `Comparable new: ${fresh}`, used && `Used resale: ${used}`].filter(Boolean);
}

export function reportContent(assessment) {
  const candidate = assessment?.suggested_response?.trim() || '';
  return {
    items: assessment?.items || [],
    questions: (assessment?.information_needed || []).slice(0, 3),
    reply: candidate && candidate.split(/\s+/).length < 40 ? candidate : fallbackReply,
  };
}

export async function buildAssessmentPdf(row, assessment) {
  const doc = await PDFDocument.create();
  doc.setTitle(`AI Assessment - Changing Places submission ${row.id}`);
  doc.setAuthor('Changing Places');
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const supported = new Set(regular.getCharacterSet());
  // Standard PDF fonts cover Latin names and punctuation. Preserve unsupported characters
  // as explicit Unicode code points instead of failing the entire submission's email.
  const printable = value => [...String(value ?? '').replace(/[\u2010-\u2015]/g, '-').replace(/\s+/g, ' ')].map(char => supported.has(char.codePointAt(0)) ? char : `[U+${char.codePointAt(0).toString(16).toUpperCase()}]`).join('');
  const width = 420, height = 595, margin = 28, bottom = 38;
  const ink = rgb(0.16, 0.31, 0.26), muted = rgb(0.38, 0.42, 0.37);
  let page, y;
  const newPage = () => {
    page = doc.addPage([width, height]); y = height - 33;
    page.drawText('CHANGING PLACES  /  AI ASSESSMENT', { x: margin, y, size: 9, font: bold, color: ink });
    y -= 23;
  };
  const ensure = space => { if (y - space < bottom) newPage(); };
  const wrap = (value, font, size, maxWidth) => {
    const words = printable(value).trim().split(/\s+/), lines = [];
    let line = '';
    for (const word of words) {
      if (font.widthOfTextAtSize([line, word].filter(Boolean).join(' '), size) <= maxWidth) { line = [line, word].filter(Boolean).join(' '); continue; }
      if (line) { lines.push(line); line = ''; }
      for (const char of word) {
        if (font.widthOfTextAtSize(line + char, size) > maxWidth) { lines.push(line); line = ''; }
        line += char;
      }
    }
    if (line) lines.push(line);
    return lines;
  };
  const paragraph = (value, { size = 12, font = regular, color = muted, indent = 0, after = 6 } = {}) => {
    for (const line of wrap(value, font, size, width - 2 * margin - indent)) {
      ensure(size + 4);
      page.drawText(line, { x: margin + indent, y, size, font, color });
      y -= size + 4;
    }
    y -= after;
  };
  const heading = title => { ensure(64); y -= 6; paragraph(title, { size: 14, font: bold, color: ink }); };
  newPage();
  paragraph(`Submission #${row.id} - ${row.name}`, { size: 18, font: bold, color: ink });
  paragraph(`${row.photo_count} photos${assessment ? ` / Approximately ${assessment.approximate_item_count} items` : ''}`, { size: 11 });
  const { items, questions, reply } = reportContent(assessment);
  if (!assessment) paragraph('AI review unavailable. Please screen the submitted photos and contact the consignor directly.');
  if (assessment?.grouping_uncertainty) paragraph(assessment.grouping_uncertainty, { size: 11 });
  for (const item of items) {
    ensure(88);
    y -= 4;
    page.drawCircle({ x: margin + 4, y: y + 4, size: 4, color: colors[item.recommendation] || colors.needs_review });
    paragraph(`${item.item}${item.quantity > 1 ? ` (${item.quantity} pieces)` : ''}`, { font: bold, size: 14, color: ink, indent: 16, after: 3 });
    const brand = item.likely_brand && !/unknown|label needed|not (visible|identified|clear)|unbranded/i.test(item.likely_brand) ? item.likely_brand : '';
    paragraph([`Photos ${item.photo_numbers.join(', ')}`, item.category, brand].filter(Boolean).join(' / '), { size: 10, after: 4 });
    paragraph(item.assessment);
    for (const price of itemPrices(item)) paragraph(price, { size: 11, after: 2 });
    y -= 8;
  }
  if (questions.length) {
    heading('To ask the consignor');
    questions.forEach((question, index) => paragraph(`${index + 1}. ${question}`));
  }
  heading('Suggested reply');
  paragraph(reply);
  for (const [index, sheet] of doc.getPages().entries()) {
    sheet.drawText(`Private - do not forward  |  Submission #${row.id}  |  ${index + 1} / ${doc.getPageCount()}`, { x: margin, y: 18, size: 8, font: regular, color: muted });
  }
  return doc.save();
}
