const fs = require('fs');
const path = require('path');

function processDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDir(fullPath);
    } else if (fullPath.endsWith('controller.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      
      let modified = false;
      
      if (content.includes('@ApiBearerAuth(')) {
        content = content.replace(/@ApiBearerAuth\([^\)]*\)\s*\n?/g, '');
        modified = true;
      }
      
      if (content.includes('ApiBearerAuth')) {
        content = content.replace(/,\s*ApiBearerAuth/g, '');
        content = content.replace(/ApiBearerAuth\s*,\s*/g, '');
        content = content.replace(/ApiBearerAuth/g, '');
        modified = true;
      }

      if (modified) {
        fs.writeFileSync(fullPath, content);
        console.log(`Updated ${fullPath}`);
      }
    }
  }
}

processDir(path.join(__dirname, 'src'));
console.log('Done');
