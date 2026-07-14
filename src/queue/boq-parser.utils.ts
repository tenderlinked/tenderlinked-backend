import * as xlsx from 'xlsx';

export function parseBoqExcel(buffer: Buffer): any[] {
  const workbook = xlsx.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  // Read as raw arrays first to easily scan for header rows
  const rawRows: any[][] = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: null });
  
  return processRawBoqArrays(rawRows);
}

export function processRawBoqArrays(rawRows: any[][]): any[] {
  if (!rawRows || rawRows.length === 0) return [];

  let headerRowIndex = -1;
  let headers: string[] = [];

  // 1. Find the actual table header row
  // We look for a row containing typical BOQ column names
  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (!Array.isArray(row)) continue;
    
    const rowString = row.join(' ').toLowerCase();
    // Keywords often found in true BOQ table headers (must have both item and quantity/pricing)
    const hasItemKeywords = 
      rowString.includes('description') || 
      rowString.includes('item') ||
      rowString.includes('sl. no.') ||
      rowString.includes('sl no') ||
      rowString.includes('particular');
      
    const hasPricingKeywords = 
      rowString.includes('quantity') ||
      rowString.includes('qty') ||
      rowString.includes('rate') ||
      rowString.includes('amount') ||
      rowString.includes('unit') ||
      rowString.includes('total');

    if (hasItemKeywords && hasPricingKeywords) {
      // Avoid matching the title rows which might contain the word "description"
      // Table headers usually have multiple non-null columns
      const nonNullCount = row.filter((c) => c !== null && c !== '').length;
      if (nonNullCount >= 3) {
        headerRowIndex = i;
        headers = row.map((col) => (col ? String(col).trim() : ''));
        break;
      }
    }
  }

  // Fallback: If no header row found by keywords, just return all rows but cleaned
  if (headerRowIndex === -1) {
    // We already have rawRows as an array of arrays. Let's convert it to object-like
    // assuming first row is headers if possible, otherwise just use indexes
    return cleanRawDataArrays(rawRows);
  }

  // 2. Extract rows using the found header
  const tableRows: any[] = [];
  for (let i = headerRowIndex + 1; i < rawRows.length; i++) {
    const row = rawRows[i];
    // 1. Skip repeating headers from PDF page breaks
    const firstColStr = String(row[0] || '').toLowerCase();
    if (firstColStr.includes('sl. no') || firstColStr.includes('sl no') || firstColStr === 'sl.') {
      continue;
    }

    const rowObj: any = {};
    let hasData = false;
    let validCellCount = 0;

    for (let j = 0; j < headers.length; j++) {
      const header = headers[j];
      const cellValue = row[j];

      if (header && header !== '') {
        const val = cellValue !== null && cellValue !== undefined ? String(cellValue).trim() : '';
        rowObj[header] = val;
        // Consider it data only if it's not just a hyphen or empty
        if (val !== '' && val !== '-') {
          hasData = true;
          validCellCount++;
        }
      }
    }

    // 2. Stop parsing if we hit a completely different table (like a Penalty or SLA table)
    // We can detect this if a row suddenly has words like "Penalty", "Requirement", "Procedure"
    const rowFullText = row.join(' ').toLowerCase();
    if (rowFullText.includes('penalty') && rowFullText.includes('requirement')) {
       break; // The BOQ is over, we've hit the terms & conditions tables!
    }

    // 3. Only keep rows that have meaningful data (at least 2 valid columns)
    // This removes weird PDF artifacts where a single word wraps onto a new line with hyphens
    if (hasData && validCellCount >= 2) {
      const cleanRowObj: any = {};
      for (const [k, v] of Object.entries(rowObj)) {
        const cleanKey = k.replace(/[\r\n]+/g, ' ').trim();
        cleanRowObj[cleanKey] = v;
      }
      tableRows.push(cleanRowObj);
    }
  }

  // 4. Clean up: Remove any columns that are completely empty across all rows
  if (tableRows.length > 0) {
    const allKeys = new Set<string>();
    tableRows.forEach(r => Object.keys(r).forEach(k => allKeys.add(k)));
    
    const keysToKeep = Array.from(allKeys).filter(key => {
      // Keep key if at least one row has a truthy/non-empty value for it
      return tableRows.some(row => {
        const val = row[key];
        return val !== undefined && val !== null && val !== '' && val !== '-';
      });
    });

    return tableRows.map(row => {
      const cleanedRow: any = {};
      for (const key of keysToKeep) {
        if (row[key] !== undefined) {
          cleanedRow[key] = row[key];
        }
      }
      return cleanedRow;
    });
  }

  return tableRows;
}

function cleanRawDataArrays(rawRows: any[][]): any[] {
  if (rawRows.length < 2) return [];
  const headers = rawRows[0].map(h => (h !== null && h !== undefined) ? String(h).trim() : '');
  
  const cleaned: any[] = [];
  for (let i = 1; i < rawRows.length; i++) {
    const row = rawRows[i];
    const cleanRow: any = {};
    let hasData = false;
    
    for (let j = 0; j < headers.length; j++) {
      const header = headers[j] || `Column_${j}`;
      const val = row[j];
      
      if (val === '' || val === null || val === undefined) {
        continue;
      }
      
      cleanRow[header] = val;
      hasData = true;
    }
    
    if (hasData) {
      cleaned.push(cleanRow);
    }
  }
  return cleaned;
}
