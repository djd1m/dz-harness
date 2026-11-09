import json
import os
from pathlib import Path
import socket
import struct
import tempfile
import threading
import unittest
from broker import Broker, Handler, Server, exact
from contract import INPUT_MAX, OUTPUT_MAX, result, validate

FAKE = '''#!/usr/bin/python3
import json,sys,time,os
from pathlib import Path
root=Path(__file__).parent
with (root/'calls').open('a') as f: f.write(json.dumps(sys.argv[1:])+'\\n')
if sys.argv[1]!='run': sys.exit(0)
mode=(root/'mode').read_text()
if mode=='hang': time.sleep(10)
if mode=='die': sys.exit(137)
if mode=='overflow': sys.stdout.write('x'*1048577);sys.stdout.flush();time.sleep(10)
sys.stdin.buffer.read()
if mode=='bad': print('not json')
elif mode=='version': print(json.dumps({'engine':{'name':'pypdf','version':'0'},'pages':[],'status':'no_text'}))
else: print(json.dumps({'engine':{'name':'pypdf','version':'7.0.0'},'pages':[],'status':'no_text'}))
'''

class Tests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.fake = self.root/'docker'
        self.fake.write_text(FAKE)
        self.fake.chmod(0o700)
        self.broker = Broker('sha256:'+'a'*64, str(self.fake), seconds=.4)
    def tearDown(self):
        self.tmp.cleanup()
    def extract(self, mode, data=b'%PDF-synthetic'):
        (self.root/'mode').write_text(mode)
        answer=self.broker.extract(data)
        calls=[json.loads(x) for x in (self.root/'calls').read_text().splitlines()]
        self.assertEqual(calls[-1][:2], ['rm','--force'])
        self.assertEqual(calls[-1][2], calls[-2][calls[-2].index('--name')+1])
        return answer
    def test_success_large_stdin(self):
        self.assertEqual(self.extract('good', b'x'*INPUT_MAX)['status'], 'no_text')
    def test_timeout(self):
        self.assertEqual(self.extract('hang')['status'], 'timeout')
    def test_client_death_cleanup(self):
        self.assertEqual(self.extract('die')['status'], 'resource_limit')
    def test_output_cap(self):
        self.assertEqual(self.extract('overflow')['status'], 'output_limit')
    def test_bad_json(self):
        self.assertEqual(self.extract('bad')['status'], 'worker_error')
    def test_wrong_version(self):
        self.assertEqual(self.extract('version')['status'], 'worker_error')
    def test_mutable_image(self):
        with self.assertRaises(ValueError): Broker('python:latest')
    def test_flags(self):
        self.extract('good')
        args=json.loads((self.root/'calls').read_text().splitlines()[0])
        for flag in ('--read-only','--network','--cap-drop','--security-opt','--user','--pids-limit','--memory','--cpus'):
            self.assertIn(flag,args)
        self.assertNotIn('--volume',args)
        self.assertNotIn('--env',args)
    def request(self, data, halfclose=True):
        path=str(self.root/'test.sock')
        with Server(path, Handler) as server:
            server.read_seconds=.1
            server.broker=self.broker
            thread=threading.Thread(target=server.handle_request)
            thread.start()
            with socket.socket(socket.AF_UNIX) as client:
                client.connect(path)
                client.sendall(data)
                if halfclose: client.shutdown(socket.SHUT_WR)
                client.settimeout(2)
                prefix=client.recv(4)
                size=struct.unpack('!I',prefix)[0]
                raw=b''
                while len(raw)<size: raw+=client.recv(size-len(raw))
            thread.join(2)
            self.assertFalse(thread.is_alive())
        os.unlink(path)
        return json.loads(raw)
    def test_truncated_prefix(self):
        self.assertEqual(self.request(b'\x00')['status'],'request_error')
    def test_truncated_body(self):
        self.assertEqual(self.request(struct.pack('!I',20)+b'abc')['status'],'request_error')
    def test_invalid_lengths(self):
        for size in (0,INPUT_MAX+1,0xffffffff):
            self.assertEqual(self.request(struct.pack('!I',size))['status'],'request_error')
    def test_socket_timeout(self):
        self.assertEqual(self.request(b'\x00',False)['status'],'request_error')
    def test_success_framing(self):
        (self.root/'mode').write_text('good')
        self.assertEqual(self.request(struct.pack('!I',4)+b'%PDF')['status'],'no_text')
    def test_payload_schema(self):
        payload=result('no_text');payload['extra']='unsafe'
        with self.assertRaises(ValueError):validate(payload)

if __name__=='__main__': unittest.main()
