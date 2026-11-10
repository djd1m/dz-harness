"""Actual standalone candidate CLI + real Hermes ContextVars; synthetic map only.

Run only in pinned offline image with package overlay, never against a real map.
Absence of installed runtime is an error, not a skipped acceptance.
"""
import json
import hashlib
import shutil
import sys
sys.path.insert(0, "/lab")
import fixtures
from recovery_verifier import verify
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
import zipfile
from unittest.mock import patch
from test_recognized_confirm import m, pkg, HealthTools
from test_intake_preview import synthetic_pdf
from recognized_fixture import pdf_draft
from gateway import session_context

class InstalledRecognizedTests(unittest.TestCase):
    def test_actual_cli_and_command_replay(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            workspace = root/'map'
            workspace.mkdir(mode=0o700)
            drafts = root/'drafts'
            drafts.mkdir(mode=0o700)
            intake = root/'intake'
            intake.mkdir(mode=0o700)
            archive = root/'technical.zip'
            with zipfile.ZipFile(archive,'w') as zipped:
                zipped.writestr('technical.pdf',synthetic_pdf())
            node = '/opt/health-node22/bin/node'
            runtime = Path('/opt/health-advisor-runtime')
            cli = runtime/'node_modules/@dzhechkov/health-advisor/bin/health-advisor.js'
            result = subprocess.run([node,str(cli),'intake-archive','--workspace',str(workspace),'--file',str(archive),'--json'],capture_output=True,timeout=30)
            self.assertEqual(result.returncode,0,'actual synthetic intake failed')
            row = json.loads((workspace/'sources/manifest.json').read_bytes())['entries'][0]
            env = {'HEALTH_WORKSPACE':str(workspace),'HEALTH_DRAFTS':str(drafts),'HEALTH_INTAKE_STATE':str(intake),
                   'HEALTH_RECOGNIZED_STATE':str(root/'recognized-state'),'HEALTH_RECOGNIZED_SYNTHETIC_WRITE':'1',
                   'HEALTH_NODE':node,'HEALTH_RUNTIME':str(runtime)}
            with patch.dict(os.environ,env):
                session_context.set_session_vars(platform='mattermost',user_id='synthetic-owner',chat_id='synthetic-chat',profile='synthetic')
                self.addCleanup(session_context.reset_session_vars)
                tools = HealthTools.configured()
                reply = {'status':'partial_text','engine':{'name':'pypdf','version':'7.0.0'},'pages':[
                    {'number':1,'text':'SYNTHETIC-RECOGNIZED-SENTINEL','text_status':'text'},
                    {'number':2,'text':'','text_status':'no_text'}]}
                with patch.object(pdf_draft,'broker_request',return_value=reply):
                    draft = tools.call('pdf_draft',{'entry_id':row['entry_id']})
                self.assertTrue(draft['ok'],draft)
                prepared = tools.call('recognized_prepare',{'draft_id':draft['draft_id'],'entry_id':row['entry_id'],
                        'expected_draft_sha256':draft['artifacts'][0]['sha256']})
                self.assertTrue(prepared['ok'],prepared)
                self.assertFalse((workspace/'recognized/.machine-unverified').exists())
                ident = prepared['proposal_id']
                handler = m.command_handler('confirm')
                saved = json.loads(handler(ident))
                self.assertEqual(saved.get('state'),'saved_unverified',saved)
                artifact = workspace/'recognized/.machine-unverified/operations'/ident/'artifact.md'
                self.assertEqual(artifact.read_bytes(),Path(draft['artifacts'][0]['path']).read_bytes())
                self.assertNotIn('SYNTHETIC-RECOGNIZED-SENTINEL',json.dumps(saved))
                export = root/'snapshot'
                external = root/'external'
                export.mkdir(mode=0o700)
                external.mkdir(mode=0o700)
                paths = ['sources/manifest.json', row['stored_at'],
                         f'recognized/.machine-unverified/operations/{ident}/artifact.md',
                         f'recognized/.machine-unverified/operations/{ident}/metadata.json']
                for relative in paths:
                    fixtures.put(export/'workspace'/relative, (workspace/relative).read_bytes())
                state = root/'recognized-state'
                fixtures.put(export/'recognized-state'/f'{ident}.recognized.json',
                             (state/f'{ident}.recognized.json').read_bytes())
                key = external/'key.bin'
                descriptor = external/'descriptor.json'
                fixtures.put(key, (state/'.recognized.key').read_bytes())
                fixtures.seal(export, descriptor, key)
                desc = json.loads(descriptor.read_bytes())
                desc['expected_owner'] = {'platform':'mattermost','user_id':'synthetic-owner',
                                          'chat_id':'synthetic-chat','profile':'synthetic'}
                desc['expected_runtime'] = m.runtime_identity(tools)
                fixtures.put(descriptor, fixtures.encode(desc))
                def tree_stamp(folder):
                    return {str(p.relative_to(folder)): (p.stat().st_mode, p.stat().st_mtime_ns,
                            hashlib.sha256(p.read_bytes()).hexdigest() if p.is_file() else None)
                            for p in folder.rglob('*')}
                before = tree_stamp(export)
                valid = verify(str(export),str(descriptor),str(key))
                self.assertTrue(valid['valid'], valid)
                moved = root/'copied-snapshot'
                shutil.copytree(export, moved)
                self.assertNotEqual(export.stat().st_ino, moved.stat().st_ino)
                copied_before = tree_stamp(moved)
                again = verify(str(moved),str(descriptor),str(key))
                self.assertTrue(again['valid'], again)
                self.assertFalse(again['executable'])
                self.assertEqual(valid, again)
                self.assertEqual(before, tree_stamp(export))
                self.assertEqual(copied_before, tree_stamp(moved))
                self.assertNotIn('SYNTHETIC-RECOGNIZED-SENTINEL', json.dumps(again))
                # Existing core must still refuse copied historical workspace identity.
                core_script = runtime/'node_modules/@dzhechkov/health-advisor/lib/recognized-cli.js'
                old_read = subprocess.run([node,str(core_script),'status','--workspace',str(moved/'workspace')],
                    input=json.dumps({'operation_id':ident}).encode(), capture_output=True,timeout=30)
                core_result = json.loads(old_read.stdout)
                self.assertFalse(core_result.get('ok',False), core_result)
                self.assertEqual(core_result.get('code'), 'corrupt_refusal', core_result)
                print(json.dumps({'actual_export_verifier':'PASS','copied_path':'PASS',
                                  'input_unchanged':True,'core_old_identity_refuses':True,
                                  'executable':False}))

if __name__ == '__main__':
    unittest.main()
