import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { LOGO_B64 } from './logo.js';
import { fmt } from './format.js';

const ORANGE = [237, 106, 35];
const ORANGE_DARK = [196, 82, 20];
const DARK = [26, 26, 26];
const GREY = [128, 128, 128];

function decorateCorner(doc) {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  doc.setFillColor(...ORANGE); doc.triangle(W, H, W - 46, H, W, H - 46, 'F');
  doc.setFillColor(...DARK); doc.triangle(W, H, W - 24, H, W, H - 14, 'F');
}

function docHeader(doc, settings, title, number, date) {
  decorateCorner(doc);
  doc.setFillColor(...DARK);
  doc.roundedRect(14, 10, 40, 26.7, 1.5, 1.5, 'F');
  try { doc.addImage(LOGO_B64, 'JPEG', 15, 11, 38, 25.3); } catch (e) { /* logo optional */ }

  doc.setFont(undefined, 'bold'); doc.setFontSize(15); doc.setTextColor(...DARK);
  doc.text(settings.name || 'HandySam Engineering', 196, 15, { align: 'right' });
  doc.setFont(undefined, 'normal'); doc.setFontSize(8); doc.setTextColor(...GREY);
  if (settings.tagline) doc.text(settings.tagline, 196, 19.5, { align: 'right' });

  const contactLine = [settings.phone, settings.email].filter(Boolean).join('   ·   ');
  if (contactLine) { doc.setFontSize(8.5); doc.setTextColor(70, 70, 70); doc.text(contactLine, 196, 25, { align: 'right' }); }
  if (settings.address) { doc.setFontSize(8); doc.setTextColor(...GREY); doc.text(settings.address, 196, 29.5, { align: 'right' }); }

  // divider sits clear of the logo's bottom edge (y=36.7); title block is
  // drawn entirely below it so the two never overlap regardless of font metrics
  doc.setDrawColor(...ORANGE); doc.setLineWidth(0.6);
  doc.line(14, 42, 196, 42);
  doc.setFont(undefined, 'bold'); doc.setFontSize(16); doc.setTextColor(...DARK);
  doc.text(title.toUpperCase(), 14, 51);
  doc.setFont(undefined, 'bold'); doc.setFontSize(10); doc.setTextColor(...ORANGE_DARK);
  doc.text('#' + number, 196, 49, { align: 'right' });
  doc.setFont(undefined, 'normal'); doc.setFontSize(9); doc.setTextColor(...GREY);
  doc.text('Date: ' + date, 196, 54, { align: 'right' });
  doc.setTextColor(0, 0, 0);
}

function billBlock(doc, label, client, contact, y) {
  doc.setFont(undefined, 'bold'); doc.setFontSize(9); doc.setTextColor(...ORANGE_DARK);
  doc.text(label, 14, y);
  doc.setFont(undefined, 'normal'); doc.setTextColor(40, 40, 40); doc.setFontSize(10.5);
  doc.text(client || '-', 48, y);
  if (contact) { doc.setFontSize(9); doc.setTextColor(110, 110, 110); doc.text(contact, 48, y + 5); }
}

function itemsTable(doc, items, startY) {
  autoTable(doc, {
    startY,
    head: [['SKU', 'DESCRIPTION', 'UOM', 'QTY', 'UNIT PRICE', 'AMOUNT']],
    body: items.map(it => [it.sku || '—', it.description, it.uom || '', it.qty, fmt(it.price), fmt((it.price || 0) * it.qty)]),
    headStyles: { fillColor: DARK, textColor: 255, fontSize: 8.5, halign: 'left' },
    bodyStyles: { fontSize: 9, textColor: [40, 40, 40] },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    columnStyles: { 0: { cellWidth: 22 }, 3: { halign: 'center' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
    theme: 'striped',
    margin: { left: 14, right: 14 },
  });
  return doc.lastAutoTable.finalY;
}

function totalsBlock(doc, t, y, label) {
  const x = 196;
  doc.setFontSize(9.5); doc.setTextColor(90, 90, 90); doc.setFont(undefined, 'normal');
  doc.text('Sub-Total', 130, y); doc.text(fmt(t.subtotal), x, y, { align: 'right' }); y += 6;
  if (t.discount) {
    doc.text(`Discount (${t.discountPct}%)`, 130, y); doc.text('-' + fmt(t.discount), x, y, { align: 'right' }); y += 6;
  }
  doc.text('VAT (16%)', 130, y); doc.text(fmt(t.vat), x, y, { align: 'right' }); y += 3;
  doc.setDrawColor(...ORANGE); doc.setLineWidth(0.5);
  doc.line(128, y, 196, y); y += 7;
  doc.setFont(undefined, 'bold'); doc.setFontSize(12); doc.setTextColor(...DARK);
  doc.text(label || 'TOTAL', 128, y); doc.text(fmt(t.total), x, y, { align: 'right' });
  return y;
}

function termsAndNotesBlock(doc, settings, y, notes) {
  y += 10;
  if (settings.terms) {
    doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.3); doc.line(14, y - 4, 196, y - 4);
    doc.setFont(undefined, 'bold'); doc.setFontSize(8.5); doc.setTextColor(...ORANGE_DARK);
    doc.text('TERMS & CONDITIONS', 14, y); y += 5;
    doc.setFont(undefined, 'normal'); doc.setFontSize(8); doc.setTextColor(90, 90, 90);
    const lines = doc.splitTextToSize(settings.terms, 182);
    doc.text(lines, 14, y); y += lines.length * 4 + 4;
  }
  if (notes) {
    doc.setFont(undefined, 'bold'); doc.setFontSize(8.5); doc.setTextColor(...ORANGE_DARK);
    doc.text('NOTES', 14, y); y += 5;
    doc.setFont(undefined, 'normal'); doc.setFontSize(8); doc.setTextColor(90, 90, 90);
    const nlines = doc.splitTextToSize(notes, 182);
    doc.text(nlines, 14, y); y += nlines.length * 4 + 4;
  }
  return y;
}

function payToBlock(doc, settings, y) {
  if (!settings.bank_name && !settings.account_name && !settings.account_number) return y;
  doc.setFont(undefined, 'bold'); doc.setFontSize(9.5); doc.setTextColor(...ORANGE_DARK);
  doc.text('PAY TO:', 14, y); y += 6;
  doc.setFont(undefined, 'normal'); doc.setFontSize(9); doc.setTextColor(60, 60, 60);
  if (settings.bank_name) { doc.text('Bank', 14, y); doc.text(settings.bank_name, 45, y); y += 5.5; }
  if (settings.account_name) { doc.text('Account Name', 14, y); doc.text(settings.account_name, 45, y); y += 5.5; }
  if (settings.account_number) { doc.text('Account Number', 14, y); doc.text(settings.account_number, 45, y); y += 5.5; }
  return y + 2;
}

export function buildStockListPDF(settings, products) {
  const doc = new jsPDF();
  docHeader(doc, settings, 'Stock List', new Date().toLocaleDateString('en-GB'), new Date().toISOString().slice(0, 10));
  autoTable(doc, {
    startY: 67,
    head: [['SKU', 'CATEGORY', 'DESCRIPTION', 'UOM', 'COST', 'SELL', 'STOCK']],
    body: products.map(p => [p.sku || '—', p.category || '', p.description, p.uom || '', p.cost ? fmt(p.cost) : '—', p.sell ? fmt(p.sell) : '—', p.stock ?? 0]),
    headStyles: { fillColor: DARK, textColor: 255, fontSize: 8.5, halign: 'left' },
    bodyStyles: { fontSize: 8.5, textColor: [40, 40, 40] },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    columnStyles: { 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'center' } },
    theme: 'striped',
    margin: { left: 14, right: 14 },
    didParseCell: (data) => {
      if (data.column.index === 6 && data.section === 'body' && Number(data.cell.raw) <= 3) {
        data.cell.styles.textColor = [190, 60, 50];
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });
  return doc;
}

export function buildCreditNotePDF(settings, note, items, invoiceNumber) {
  const t = { subtotal: note.subtotal, discountPct: note.discount_pct, discount: note.discount, vat: note.vat, total: note.total };
  const doc = new jsPDF();
  docHeader(doc, settings, 'Credit Note', note.number || 'DRAFT', note.date);
  billBlock(doc, 'ISSUED TO:', note.client, note.client_contact, 67);
  if (invoiceNumber) { doc.setFont(undefined, 'normal'); doc.setFontSize(9); doc.setTextColor(110, 110, 110); doc.text('Against invoice: ' + invoiceNumber, 48, 72); }
  let y = itemsTable(doc, items, 78);
  y += 10;
  y = totalsBlock(doc, t, y + 4, 'TOTAL CREDIT');
  const notes = [note.reason, note.notes].filter(Boolean).join(' — ');
  termsAndNotesBlock(doc, settings, y, notes);
  return doc;
}

export function buildBillPDF(settings, bill, items) {
  const t = { subtotal: bill.subtotal, discountPct: 0, discount: 0, vat: bill.vat, total: bill.total };
  const doc = new jsPDF();
  docHeader(doc, settings, 'Bill', bill.number || 'DRAFT', bill.date);
  billBlock(doc, 'FROM VENDOR:', bill.vendor, bill.due_date ? ('Due: ' + bill.due_date) : null, 67);
  let y = itemsTable(doc, items, 78);
  y += 10;
  y = totalsBlock(doc, t, y + 4, 'TOTAL DUE');
  y += 9;
  doc.setFont(undefined, 'bold'); doc.setFontSize(9);
  doc.setTextColor(...(bill.status === 'paid' ? [30, 140, 70] : [190, 60, 50]));
  doc.text('STATUS: ' + bill.status.toUpperCase(), 14, y);
  termsAndNotesBlock(doc, settings, y, bill.notes);
  return doc;
}

export function buildQuotePDF(settings, quote, items) {
  const t = { subtotal: quote.subtotal, discountPct: quote.discount_pct, discount: quote.discount, vat: quote.vat, total: quote.total };
  const doc = new jsPDF();
  docHeader(doc, settings, 'Quotation', quote.number || 'DRAFT', quote.date);
  billBlock(doc, 'QUOTED TO:', quote.client, quote.client_contact, 67);
  let y = itemsTable(doc, items, 75);
  y += 10;
  y = payToBlock(doc, settings, y);
  y = totalsBlock(doc, t, y + 4, 'TOTAL');
  termsAndNotesBlock(doc, settings, y, quote.notes);
  return doc;
}

export function buildInvoicePDF(settings, invoice, items) {
  const t = { subtotal: invoice.subtotal, discountPct: invoice.discount_pct, discount: invoice.discount, vat: invoice.vat, total: invoice.total };
  const doc = new jsPDF();
  docHeader(doc, settings, 'Invoice', invoice.number, invoice.date);
  billBlock(doc, 'BILLED TO:', invoice.client, invoice.client_contact, 67);
  let y = itemsTable(doc, items, 75);
  y += 10;
  y = payToBlock(doc, settings, y);
  y = totalsBlock(doc, t, y + 4, 'TOTAL DUE');
  y += 9;
  doc.setFont(undefined, 'bold'); doc.setFontSize(9);
  doc.setTextColor(...(invoice.status === 'paid' ? [30, 140, 70] : [190, 60, 50]));
  doc.text('STATUS: ' + invoice.status.toUpperCase(), 14, y);
  termsAndNotesBlock(doc, settings, y, invoice.notes);
  return doc;
}

export function buildReceiptPDF(settings, receipt) {
  const doc = new jsPDF();
  docHeader(doc, settings, 'Receipt', receipt.number, receipt.date);
  billBlock(doc, 'RECEIVED FROM:', receipt.client, null, 67);
  doc.setFont(undefined, 'normal'); doc.setFontSize(10); doc.setTextColor(60, 60, 60);
  doc.text('Against invoice: ' + (receipt.invoiceNumber || ''), 14, 80);
  doc.text('Payment method: ' + receipt.method, 14, 87);
  doc.setDrawColor(...ORANGE); doc.line(14, 94, 196, 94);
  doc.setFont(undefined, 'bold'); doc.setFontSize(11); doc.setTextColor(...DARK);
  doc.text('AMOUNT RECEIVED', 14, 105);
  doc.setFontSize(18);
  doc.text(fmt(receipt.amount), 196, 105, { align: 'right' });
  payToBlock(doc, settings, 119);
  return doc;
}
