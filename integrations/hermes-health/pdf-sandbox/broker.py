"""Sequential host-only AF_UNIX broker. Never import the PDF parser here."""
import argparse
import json
import os
import re
import selectors
import signal
import socket
import socketserver
import struct
import subprocess
import time
import uuid
from contract import INPUT_MAX, OUTPUT_MAX, encode, result, validate

class CleanupError(RuntimeError):
    pass

class Broker:
    def __init__(self, image, docker='/usr/bin/docker', seconds=5.0):
        if not re.fullmatch(r'(?:[a-zA-Z0-9][a-zA-Z0-9._:/-]*@)?sha256:[a-f0-9]{64}', image):
            raise ValueError('Operator must supply a pinned sha256 image')
        self.image, self.docker, self.seconds = image, docker, seconds

    def cleanup(self, name):
        # Always contact daemon, even when docker run already exited or was killed.
        for _ in range(3):
            try:
                removed = subprocess.run([self.docker, 'rm', '--force', name], stdin=subprocess.DEVNULL,
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=5, env={'PATH': '/usr/bin:/bin'})
                if removed.returncode == 0:
                    return
                # --rm may already have removed it. Distinguish daemon failure from absence.
                probe = subprocess.run([self.docker, 'ps', '--all', '--quiet', '--filter', 'name=^/' + name + '$'],
                    stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                    timeout=5, env={'PATH': '/usr/bin:/bin'})
                if probe.returncode == 0 and not probe.stdout.strip():
                    return
            except (OSError, subprocess.TimeoutExpired):
                pass
        raise CleanupError('Cannot confirm sandbox removal; stop broker and reconcile daemon')

    def extract(self, data):
        name = 'health-pdf-' + uuid.uuid4().hex
        command = [self.docker, 'run', '--rm', '--name', name, '--network', 'none', '--read-only',
                   '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--user', '65534:65534',
                   '--pids-limit', '32', '--memory', '256m', '--memory-swap', '256m', '--cpus', '1',
                   '--log-driver', 'none', '--interactive', '--pull', 'never', self.image]
        process = None
        try:
            process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL, env={'PATH': '/usr/bin:/bin'}, close_fds=True)
            os.set_blocking(process.stdin.fileno(), False)
            os.set_blocking(process.stdout.fileno(), False)
            output, position = bytearray(), 0
            deadline = time.monotonic() + self.seconds
            with selectors.DefaultSelector() as selector:
                selector.register(process.stdin, selectors.EVENT_WRITE)
                selector.register(process.stdout, selectors.EVENT_READ)
                while selector.get_map():
                    remaining = deadline - time.monotonic()
                    if remaining <= 0:
                        return result('timeout')
                    events = selector.select(remaining)
                    if not events:
                        return result('timeout')
                    for key, _ in events:
                        if key.fileobj is process.stdin:
                            try:
                                position += os.write(process.stdin.fileno(), memoryview(data)[position:position + 65536])
                            except BrokenPipeError:
                                position = len(data)
                            if position == len(data):
                                selector.unregister(process.stdin)
                                process.stdin.close()
                        else:
                            chunk = os.read(process.stdout.fileno(), min(65536, OUTPUT_MAX + 1 - len(output)))
                            if not chunk:
                                selector.unregister(process.stdout)
                            output.extend(chunk)
                            if len(output) > OUTPUT_MAX:
                                return result('output_limit')
            try:
                process.wait(timeout=max(0, deadline - time.monotonic()))
            except subprocess.TimeoutExpired:
                return result('timeout')
            if process.returncode:
                return result('resource_limit' if process.returncode in (-9, 137) else 'worker_error')
            try:
                def unique(pairs):
                    obj = {}
                    for key, value in pairs:
                        if key in obj:
                            raise ValueError('duplicate key')
                        obj[key] = value
                    return obj
                return validate(json.loads(output, object_pairs_hook=unique))
            except (ValueError, TypeError, UnicodeError, RecursionError):
                return result('worker_error')
        except OSError:
            return result('engine_unavailable')
        finally:
            if process is not None:
                if process.poll() is None:
                    process.kill()
                process.wait()
                process.stdin.close()
                process.stdout.close()
            self.cleanup(name)

def exact(sock, size, deadline):
    parts = bytearray()
    while len(parts) < size:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError()
        sock.settimeout(remaining)
        chunk = sock.recv(min(65536, size - len(parts)))
        if not chunk:
            raise ValueError('truncated request')
        parts.extend(chunk)
    return bytes(parts)

class Handler(socketserver.BaseRequestHandler):
    def handle(self):
        try:
            deadline = time.monotonic() + self.server.read_seconds
            size = struct.unpack('!I', exact(self.request, 4, deadline))[0]
            if not 1 <= size <= INPUT_MAX:
                raise ValueError('length')
            data = exact(self.request, size, deadline)
        except (ValueError, OSError, TimeoutError):
            payload = result('request_error')
        else:
            payload = self.server.broker.extract(data)
        raw = encode(payload)
        try:
            self.request.settimeout(self.server.read_seconds)
            self.request.sendall(struct.pack('!I', len(raw)) + raw)
        except OSError:
            pass

class Server(socketserver.UnixStreamServer):
    request_queue_size = 4
    read_seconds = 5.0
    def handle_error(self, request, client_address):
        # Cleanup failure is fatal: do not continue accepting jobs.
        raise CleanupError('Broker stopped after request failure')

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--socket', required=True)
    parser.add_argument('--image', required=True)
    args = parser.parse_args()
    broker = Broker(args.image)
    def stop(signum, frame):
        raise SystemExit(128 + signum)
    signal.signal(signal.SIGTERM, stop)
    # Operator owns private parent directory. Never unlink an existing pathname.
    old = os.umask(0o117)
    try:
        server = Server(args.socket, Handler)
    finally:
        os.umask(old)
    os.chmod(args.socket, 0o660)
    server.broker = broker
    try:
        with server:
            server.serve_forever()
    finally:
        os.unlink(args.socket)

if __name__ == '__main__':
    main()
