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
                marker = root/'.health-index-lab-synthetic'
                marker.write_text(json.dumps({'schema':'hermes-recognized-index-lab-1','workspace':str(workspace),'nonce':'a'*32}))
                marker.chmod(0o600)
                seed = workspace/'seed.txt'
                seed.write_text('Synthetic technical index bootstrap.\n')
                script = "require(process.argv[1]).ingest({workspace:process.argv[2],documentPath:'seed.txt',case:'synthetic',kind:'conclusion',date:'2026-11-09',anchors:[]}).then(x=>console.log(JSON.stringify(x)),e=>{console.error(e);process.exit(1)})"
                out = subprocess.run([node,'-e',script,str(cli.parent.parent/'skills/third-brain/engine/write.js'),str(workspace)],capture_output=True,timeout=120)
                self.assertEqual(out.returncode,0,out.stderr[:500])
                import hashlib
                def protected():
                    return {str(p.relative_to(workspace)):hashlib.sha256(p.read_bytes()).hexdigest() for folder in ('sources','recognized') for p in (workspace/folder).rglob('*') if p.is_file()}
                before = protected()
                def lab(verb,*args):
                    out = subprocess.run([node,'/lab/index_lab.js',verb,'--lab-root',str(root),'--workspace',str(workspace),'--operation-id',ident,'--case','synthetic',*args],capture_output=True,timeout=120)
                    value = json.loads(out.stdout)
                    self.assertEqual(out.returncode,0,value)
                    self.assertEqual(value['operation_id'],ident)
                    self.assertEqual(value['core_index_status'],'not_requested')
                    self.assertEqual(value['label'],'НЕПРОВЕРЕНО')
                    return value
                plan = lab('plan')
                applied = lab('apply','--execute','--synthetic-confirm','--expect-plan-sha256',plan['plan_sha256'])
                self.assertEqual(applied['status'],'indexed_unverified_at_check_time')
                repeat = lab('apply','--execute','--synthetic-confirm','--expect-plan-sha256',plan['plan_sha256'])
                self.assertFalse(repeat['write_attempted'])
                self.assertEqual(applied['record_ids'],repeat['record_ids'])
                self.assertEqual(lab('reconcile')['coverage'],'complete')
                self.assertEqual(lab('search-known','--query','SYNTHETIC-RECOGNIZED-SENTINEL')['status'],'known_source_reachable_at_check_time')
                final = json.loads(m.command_handler('status')(ident))
                self.assertEqual(final['state'],'saved_unverified')
                self.assertEqual(final['index_status'],'not_requested')
                self.assertEqual(before,protected())
                print(json.dumps({'combined_chain':'PASS','expected_count':applied['expected_count'],'repeat_no_write':True,'core_receipt_unchanged':True,'source_artifact_hashes_unchanged':True}))

if __name__ == '__main__':
    unittest.main()
