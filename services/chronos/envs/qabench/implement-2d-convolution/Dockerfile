FROM ghcr.io/laude-institute/t-bench/python-3-13:20250620

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        gcc \
        g++ \
        gfortran \
        make \
        && rm -rf /var/lib/apt/lists/*

RUN pip install numpy pillow

WORKDIR /app

CMD ["/bin/bash"]
