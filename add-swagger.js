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
      
      // Ensure ApiResponse is imported from @nestjs/swagger
      if (content.includes('@nestjs/swagger') && !content.includes('ApiResponse')) {
        content = content.replace(/import \{(.*?)\} from ['"]@nestjs\/swagger['"];/, (match, p1) => {
          return `import { ${p1.trim()}, ApiResponse } from '@nestjs/swagger';`;
        });
      } else if (!content.includes('@nestjs/swagger')) {
        content = `import { ApiResponse, ApiTags, ApiOperation } from '@nestjs/swagger';\n` + content;
      }

      // Add ApiResponse after ApiOperation if not already there
      const apiOpRegex = /(@ApiOperation\(\{.*\}\))\s*(?!@ApiResponse)/g;
      const defaultResponses = `\n  @ApiResponse({ status: 200, description: 'Successful response' })\n  @ApiResponse({ status: 400, description: 'Bad Request' })\n  @ApiResponse({ status: 401, description: 'Unauthorized' })\n  @ApiResponse({ status: 500, description: 'Internal Server Error' })`;
      
      let modified = false;
      content = content.replace(apiOpRegex, (match, p1) => {
        // Double check if there's an ApiResponse manually added next line, by seeing if the original match has it (already handled by negative lookahead, but just to be sure)
        modified = true;
        return p1 + defaultResponses;
      });

      if (modified) {
        fs.writeFileSync(fullPath, content);
        console.log(`Updated ${fullPath}`);
      }
    } else if (fullPath.endsWith('dto.ts') && !fullPath.includes('create-tender.dto')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      if (!content.includes('@ApiProperty')) {
         if (content.includes('@nestjs/swagger')) {
            if (!content.includes('ApiProperty')) {
               content = content.replace(/import \{(.*?)\} from ['"]@nestjs\/swagger['"];/, (match, p1) => {
                 return `import { ${p1.trim()}, ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';`;
               });
            }
         } else {
            content = `import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';\n` + content;
         }
         
         const isStringRegex = /(@IsString\(\)|@IsNumber\(\)|@IsBoolean\(\)|@IsArray\(\))(\s*@IsOptional\(\))?\s*([a-zA-Z0-9_]+)\??\s*:\s*[a-zA-Z\[\]]+;/g;
         content = content.replace(isStringRegex, (match, type, opt, prop) => {
            if (opt) {
               return `@ApiPropertyOptional({ description: 'The ${prop} field' })\n  ${match}`;
            }
            return `@ApiProperty({ description: 'The ${prop} field' })\n  ${match}`;
         });
         
         fs.writeFileSync(fullPath, content);
         console.log(`Updated ${fullPath}`);
      }
    }
  }
}

processDir(path.join(__dirname, 'src'));
console.log('Done');
