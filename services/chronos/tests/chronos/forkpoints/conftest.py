def pytest_configure(config):
    config.addinivalue_line(
        "markers", "integration: Plan 002 integration-readiness probes"
    )
