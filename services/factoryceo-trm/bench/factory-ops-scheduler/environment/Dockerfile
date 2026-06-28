FROM python:3.12-slim
WORKDIR /task
# the FactoryCEO engine (src/) is mounted/copied at the repo root so `import src.*` resolves
COPY . /task
RUN pip install --no-cache-dir pydantic numpy pytest
ENV PYTHONUNBUFFERED=1
CMD ["bash", "tests/test.sh"]
