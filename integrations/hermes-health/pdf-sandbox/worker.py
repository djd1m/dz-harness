"""Fixed stdin-only parser, running exclusively inside the sandbox image."""
import io
import resource
import sys
from contract import INPUT_MAX, OUTPUT_MAX, encode, result

def main():
    resource.setrlimit(resource.RLIMIT_AS, (256 * 1024**2,) * 2)
    resource.setrlimit(resource.RLIMIT_CPU, (5, 5))
    resource.setrlimit(resource.RLIMIT_FSIZE, (0, 0))
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    payload = result('worker_error')
    try:
        import pypdf
        if pypdf.__version__ != '7.0.0':
            payload['status'] = 'unsupported_engine_version'
        else:
            data = sys.stdin.buffer.read(INPUT_MAX + 1)
            if len(data) > INPUT_MAX:
                payload['status'] = 'input_limit'
            else:
                reader = pypdf.PdfReader(io.BytesIO(data), strict=True)
                if reader.is_encrypted:
                    payload['status'] = 'encrypted'
                elif len(reader.pages) > 50:
                    payload['status'] = 'page_limit'
                else:
                    pages, total = [], 0
                    for i, page in enumerate(reader.pages, 1):
                        text = page.extract_text() or ''
                        total += len(text)
                        if len(text) > 100000 or total > 500000:
                            payload['status'] = 'output_limit'
                            break
                        pages.append({'number': i, 'text': text, 'text_status': 'text' if text.strip() else 'no_text'})
                    else:
                        count = sum(bool(p['text'].strip()) for p in pages)
                        payload.update(pages=pages, status='no_text' if not count else ('ok' if count == len(pages) else 'partial_text'))
    except ImportError:
        payload = result('engine_unavailable')
    except MemoryError:
        payload = result('resource_limit')
    except Exception:
        payload = result('invalid_pdf')
    raw = encode(payload)
    if len(raw) > OUTPUT_MAX:
        raw = encode(result('output_limit'))
    sys.stdout.buffer.write(raw)

if __name__ == '__main__':
    main()
