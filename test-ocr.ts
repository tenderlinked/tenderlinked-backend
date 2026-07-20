import * as Module from 'module';
const originalRequire = Module.prototype.require;
(Module.prototype as any).require = function(request: string) {
  if (request === 'canvas') {
    return require('@napi-rs/canvas');
  }
  return originalRequire.apply(this, arguments);
};

import { extractTextWithOcr } from './src/common/utils/ocr.util';
import * as path from 'path';
import * as fs from 'fs';

async function run() {
  const dummyPdf = path.join(__dirname, 'dummy.pdf');
  
  try {
      console.log('Testing extractTextWithOcr...');
      const text = await extractTextWithOcr(dummyPdf);
      console.log('Extracted Text length:', text.length);
  } catch (e) {
      console.error('OCR Error:', e);
  }
}

run();
