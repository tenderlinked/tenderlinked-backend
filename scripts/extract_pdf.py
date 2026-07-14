import sys
import json
import pdfplumber

def extract_boq(pdf_path):
    all_rows = []
    try:
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                # Extract tables using default settings which work well for bordered tables
                tables = page.extract_tables()
                for table in tables:
                    for row in table:
                        if row is None:
                            continue
                        # Clean out None values and newlines
                        clean_row = [str(cell).replace('\n', ' ').strip() if cell is not None else "" for cell in row]
                        # Only keep rows that have some text
                        if any(clean_row):
                            all_rows.append(clean_row)
        
        # Return success with raw 2D array
        print(json.dumps({"success": True, "data": all_rows}))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))

if __name__ == "__main__":
    # Ensure stdout uses utf-8
    sys.stdout.reconfigure(encoding='utf-8')
    
    if len(sys.argv) > 1:
        extract_boq(sys.argv[1])
    else:
        print(json.dumps({"success": False, "error": "No PDF path provided"}))
