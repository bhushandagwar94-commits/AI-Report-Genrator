import zipfile
import re
import sys

sys.stdout.reconfigure(encoding='utf-8')

try:
    with zipfile.ZipFile('tmp-ai-report.docx', 'r') as z:
        xml = z.read('word/document.xml').decode('utf-8')
        paragraphs = re.findall(r'<w:p\b[^>]*>.*?</w:p>', xml)
        
        print("=== HEADINGS EXTRACTED FROM DOCX ===")
        count = 0
        for p in paragraphs:
            texts = re.findall(r'<w:t[^>]*>(.*?)</w:t>', p)
            if texts:
                full_text = ''.join([re.sub(r'<[^>]+>', '', t) for t in texts])
                if re.match(r'^(Chapter |1\.\d+ |2\.\d+ |GR-\d+ |3\.\d+ ECM)', full_text):
                    print(full_text)
                    count += 1
                    if count > 50:
                        break
except Exception as e:
    print(f"Error: {e}")
