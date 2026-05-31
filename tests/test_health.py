"""
Tests: Healthcheck endpoint — F1.3 del ROADMAP v5.
"""
import json


def test_health_returns_200(client):
    """Healthcheck devuelve 200 con checks."""
    resp = client.get('/api/health')
    assert resp.status_code == 200
    data = resp.get_json()
    assert 'status' in data
    assert 'checks' in data
    assert data['checks']['db']['status'] == 'ok'
    assert 'uptime' in data
    assert 'version' in data


def test_health_all_checks_present(client):
    """Todos los checks esperados están presentes."""
    resp = client.get('/api/health')
    data = resp.get_json()
    assert 'db' in data['checks']
    assert 'drive' in data['checks']
    assert 'whatsapp_bot' in data['checks']


def test_health_uptime_format(client):
    """Uptime tiene formato legible."""
    resp = client.get('/api/health')
    data = resp.get_json()
    assert 'h' in data['uptime'] and 'm' in data['uptime']


def test_health_version_string(client):
    """Version es string."""
    resp = client.get('/api/health')
    assert isinstance(resp.get_json()['version'], str)
    assert len(resp.get_json()['version']) > 0
