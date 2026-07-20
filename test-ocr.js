const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
const Tesseract = require('tesseract.js');

async function testOCR() {
  const pdfPath = path.join(__dirname, 'test.pdf'); // We need a real pdf
  if (!fs.existsSync(pdfPath)) {
    console.log("No test.pdf found, creating a dummy one using pdfkit or similar? Skipping.");
    return;
  }
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const pdf = await pdfjsLib.getDocument({ data, standardFontDataUrl: 'node_modules/pdfjs-dist/standard_fonts/' }).promise;
  console.log("PDF loaded, pages:", pdf.numPages);
}

testOCR().catch(console.error);
