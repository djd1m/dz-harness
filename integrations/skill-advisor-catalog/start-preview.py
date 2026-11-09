#!/usr/bin/env python3
"""Private VPS convenience launcher. Never sources a shell file or prints credentials."""
import os
from pathlib import Path
import sys

env = os.environ.copy()
if 'OPENROUTER_API_KEY' not in env:
    path = Path('/etc/aicoding/e2b-tests.env')
    if not path.is_file():
        sys.exit('Set OPENROUTER_API_KEY in the server environment before starting.')
    for line in path.read_text().splitlines():
        if line.startswith('OPENROUTER_API_KEY='):
            env['OPENROUTER_API_KEY'] = line.split('=', 1)[1].strip().strip('\"\'')
if not env.get('OPENROUTER_API_KEY'):
    sys.exit('Provider credential unavailable.')
fonts = Path('/opt/aicoding-site/public/fonts')
if fonts.is_dir():
    env.setdefault('ADVISOR_FONTS_DIR', str(fonts))
script = Path(__file__).resolve().with_name('preview-server.mjs')
os.execvpe('node', ['node', str(script)], env)
