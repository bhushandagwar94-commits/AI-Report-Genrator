import docx
import sys

def extract_text(filename):
    try:
        doc = docx.Document(filename)
        text = []
        capture_ecm = False
        count = 0

        for p in doc.paragraphs:
            content = p.text.strip()
            if not content:
                continue

            if content.startswith("3.1 ECM 1 ") or content.startswith("3.8 ECM 13 "):
                capture_ecm = True
            
            if capture_ecm:
                text.append(content)
                count += 1
                if count > 20:
                    capture_ecm = False
                    count = 0
                    text.append("----")
                    
        print("\n".join(text))
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    extract_text("tmp-ai-report.docx")
