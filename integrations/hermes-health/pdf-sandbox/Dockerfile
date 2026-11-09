ARG PYTHON_BASE=python:3.12-slim@sha256:5e2bdb1b0d542d5039cffb8181c65930093949194a65c365dfb1b0fe13a4fa5b
FROM ${PYTHON_BASE}
COPY requirements.txt /opt/pdf/requirements.txt
RUN python -m pip install --no-cache-dir --require-hashes -r /opt/pdf/requirements.txt
COPY worker.py contract.py /opt/pdf/
USER 65534:65534
ENTRYPOINT ["python", "-E", "-s", "-B", "/opt/pdf/worker.py"]
