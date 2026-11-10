"""Actual standalone candidate CLI + real Hermes ContextVars; synthetic map only.

Run only in pinned offline image with package overlay, never against a real map.
Absence of installed runtime is an error, not a skipped acceptance.
"""
import json
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
            workspace.mkdir()
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
                before = artifact.stat().st_mtime_ns
                # Actual separate-process crash around durable intent and final receipt.
                for crash_state, after, expected in [('committing', False, 'prepared'),
                                                      ('committing', True, 'reconciliation_required'),
                                                      ('saved_unverified', False, 'saved_unverified'),
                                                      ('saved_unverified', True, 'saved_unverified')]:
                    proposal = m.prepare(tools, {'draft_id':draft['draft_id'],'entry_id':row['entry_id'],
                                                'expected_draft_sha256':draft['artifacts'][0]['sha256']})
                    crash_id = proposal['proposal_id']
                    pid = os.fork()
                    if pid == 0:
                        original = m.RecognizedStore.save
                        def crash_save(store, receipt):
                            if receipt['state'] == crash_state and not after:
                                os.kill(os.getpid(), 9)
                            original(store, receipt)
                            if receipt['state'] == crash_state and after:
                                os.kill(os.getpid(), 9)
                        with patch.object(m.RecognizedStore,'save',crash_save):
                            m.command_handler('confirm')(crash_id)
                        os._exit(90)
                    _, status = os.waitpid(pid, 0)
                    self.assertTrue(os.WIFSIGNALED(status))
                    recovered = json.loads(m.command_handler('status')(crash_id))
                    self.assertEqual(recovered.get('state'),expected,recovered)
                proposal = m.prepare(tools, {'draft_id':draft['draft_id'],'entry_id':row['entry_id'],
                                            'expected_draft_sha256':draft['artifacts'][0]['sha256']})
                replace_id = proposal['proposal_id']
                pid = os.fork()
                if pid == 0:
                    original_replace = m.os.replace
                    def crash_after_replace(src, dst, **kwargs):
                        pending = m.strict_json(m.private_read(kwargs['src_dir_fd'],src,1024*1024))
                        original_replace(src,dst,**kwargs)
                        if pending.get('payload',{}).get('state') == 'saved_unverified':
                            os.kill(os.getpid(),9)
                    with patch.object(m.os,'replace',crash_after_replace):
                        m.command_handler('confirm')(replace_id)
                    os._exit(90)
                _, status = os.waitpid(pid,0)
                self.assertTrue(os.WIFSIGNALED(status))
                self.assertEqual(json.loads(m.command_handler('status')(replace_id)).get('state'),'saved_unverified')
                # Recovery must work after the original draft disappears.
                for path in (drafts/draft['draft_id']).iterdir():
                    path.unlink()
                (drafts/draft['draft_id']).rmdir()
                replay = json.loads(handler(ident))
                self.assertEqual(replay.get('state'),'saved_unverified',replay)
                self.assertEqual(before,artifact.stat().st_mtime_ns)
                self.assertFalse(tools.call('source_get',{'path':str(artifact.relative_to(workspace))})['ok'])
                self.assertFalse((workspace/'.health-brain').exists())
                self.assertEqual(saved['index_status'],'not_requested')
                # Fake successes with corrupt public bindings cannot retain saved status.
                original_core = m.core_run
                for field, bad in [('text_sha256','0'*64),('text_bytes',True),('index_status','indexed'),
                                   ('request_sha256','0'*64),('engine',{'name':'other','version':'1'})]:
                    def altered(tools, action, request):
                        value = original_core(tools,action,request)
                        if action == 'status':
                            value[field] = bad
                        return value
                    with patch.object(m,'core_run',altered):
                        refused = json.loads(handler(ident))
                        self.assertEqual(refused.get('state'),'reconciliation_required',refused)
                        self.assertEqual(refused['artifact_presence'],'previously_observed_unverified')
                self.assertEqual(json.loads(handler(ident))['state'],'saved_unverified')
                self.assertEqual(before,artifact.stat().st_mtime_ns)
                base_identity = {'platform':'mattermost','user_id':'synthetic-owner','chat_id':'synthetic-chat','profile':'synthetic'}
                for field in base_identity:
                    session_context.set_session_vars(**{**base_identity,field:'other'})
                    self.assertFalse(json.loads(m.command_handler('status')(ident))['ok'])
                    self.assertFalse(json.loads(m.command_handler('cancel')(ident))['ok'])
                    session_context.reset_session_vars()
                session_context.set_session_vars(**base_identity)
                # Saved artifact remains observed after late source drift; no blind save.
                source = workspace/row['stored_at']
                source.chmod(0o600)
                source.write_bytes(source.read_bytes()+b'DRIFT')
                drift = json.loads(handler(ident))
                self.assertEqual(drift.get('state'),'reconciliation_required')
                self.assertEqual(drift['artifact_presence'],'previously_observed_unverified')
                self.assertTrue(artifact.exists())


if __name__ == '__main__':
    unittest.main()
