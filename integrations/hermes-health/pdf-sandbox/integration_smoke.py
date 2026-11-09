from pathlib import Path
import tempfile,os,subprocess,time,json,hashlib,shutil
import argparse
parser=argparse.ArgumentParser(description='Synthetic Docker + broker + adapter acceptance; requires Docker access')
parser.add_argument('--parser-image', required=True)
parser.add_argument('--hermes-image', required=True)
args=parser.parse_args()
repo=Path(__file__).resolve().parents[1]
root=Path(tempfile.mkdtemp(prefix='health-pdf-integration-'));os.chmod(root,0o755)
proc=None
try:
 text='BT /F1 12 Tf 30 100 Td (TECHNICAL ACCEPTANCE TEST) Tj ET'
 objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',f'<< /Length {len(text)} >>\nstream\n{text}\nendstream']
 raw=bytearray(b'%PDF-1.4\n'); offsets=[]
 for i,obj in enumerate(objects,1):
  offsets.append(len(raw));raw.extend(f'{i} 0 obj\n{obj}\nendobj\n'.encode())
 x=len(raw);raw.extend(b'xref\n0 6\n0000000000 65535 f \n')
 for o in offsets:raw.extend(f'{o:010} 00000 n \n'.encode())
 raw.extend(f'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n{x}\n%%EOF\n'.encode());raw=bytes(raw)
 (root/'map/sources/raw').mkdir(parents=True);(root/'map/sources/raw/technical.pdf').write_bytes(raw)
 digest=hashlib.sha256(raw).hexdigest()
 (root/'map/sources/manifest.json').write_text(json.dumps({'schema':'ha-intake-manifest-1','entries':[{'entry_id':'technical-entry','stored_at':'sources/raw/technical.pdf','sha256':digest,'bytes':len(raw)}]}))
 (root/'drafts').mkdir(mode=0o700);os.chown(root/'drafts',1000,1001)
 (root/'socket').mkdir(mode=0o750);os.chown(root/'socket',0,1001)
 image=args.parser_image
 proc=subprocess.Popen(['/usr/bin/python3','-B',str(repo/'pdf-sandbox/broker.py'),'--socket',str(root/'socket/broker.sock'),'--image',image],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 for _ in range(100):
  if (root/'socket/broker.sock').exists():break
  if proc.poll() is not None:raise RuntimeError('broker exited')
  time.sleep(.05)
 os.chown(root/'socket/broker.sock',0,1001)
 code='''import sys,importlib.util,json,hashlib,os
from pathlib import Path
p=Path('/plugin');s=importlib.util.spec_from_file_location('health',p/'__init__.py',submodule_search_locations=[str(p)]);m=importlib.util.module_from_spec(s);sys.modules[s.name]=m;s.loader.exec_module(m)
from health.health_plugin import HealthTools
h=HealthTools.configured();before=hashlib.sha256((h.workspace/'sources/manifest.json').read_bytes()).hexdigest();r=h.call('pdf_draft',{'entry_id':'technical-entry'});assert r['ok'],r;assert r['status']=='ok';assert len(r['artifacts'])==2
for a in r['artifacts']:
 b=Path(a['path']).read_bytes();assert hashlib.sha256(b).hexdigest()==a['sha256'];assert b'TECHNICAL ACCEPTANCE TEST' in b;assert os.stat(a['path']).st_mode&0o777==0o600
assert before==hashlib.sha256((h.workspace/'sources/manifest.json').read_bytes()).hexdigest()
print(json.dumps({'real_broker_adapter':'PASS','status':r['status'],'artifacts':len(r['artifacts']),'manifest_unchanged':True,'engine':r['engine']}))
'''
 cmd=['docker','run','--rm','--network','none','--user','1000:1001','-i','-v',str(repo)+':/plugin:ro','-v',str(root/'map')+':/workspace/test:ro','-v',str(root/'drafts')+':/drafts','-v',str(root/'socket')+':/run/pdf:ro','-e','HEALTH_WORKSPACE=/workspace/test','-e','HEALTH_DRAFTS=/drafts','-e','HEALTH_PDF_SOCKET=/run/pdf/broker.sock','--entrypoint','python',args.hermes_image,'-']
 subprocess.run(cmd,input=code.encode(),check=True,timeout=40)
finally:
 if proc is not None:
  proc.terminate()
  try:proc.wait(timeout=20)
  except subprocess.TimeoutExpired:proc.kill();proc.wait()
 shutil.rmtree(root)
