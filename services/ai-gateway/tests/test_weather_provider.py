"""WeatherProvider — MOCK-verified only (no provisioned WEATHER_API_KEY, no network).

Injects a fake httpx client to prove the OpenWeather mapping + unit conversion and the factory's
key-gating, and that the stub degrades to None (never fabricates weather).
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest

from providers.weather_provider import (
    OpenWeatherProvider,
    StubWeatherProvider,
    WeatherSummary,
    build_weather_provider,
)


class _FakeResponse:
    def __init__(self, payload, status_ok=True):
        self._payload = payload
        self._status_ok = status_ok

    def raise_for_status(self):
        if not self._status_ok:
            raise RuntimeError("HTTP error")

    def json(self):
        return self._payload


class _FakeClient:
    def __init__(self, response, capture):
        self._response = response
        self._capture = capture

    async def get(self, url, params):
        self._capture["url"] = url
        self._capture["params"] = params
        return self._response


@pytest.mark.asyncio
async def test_stub_degrades_to_none():
    assert await StubWeatherProvider().current(13.75, 100.5) is None


@pytest.mark.asyncio
async def test_openweather_maps_payload_and_converts_wind():
    capture: dict = {}
    payload = {
        "weather": [{"description": "light rain"}],
        "main": {"temp": 31.4},
        "wind": {"speed": 5.0},  # m/s → 18 km/h
        "rain": {"1h": 2.5},
    }
    provider = OpenWeatherProvider("KEY", client=_FakeClient(_FakeResponse(payload), capture))
    summary = await provider.current(13.75, 100.5)
    assert summary == WeatherSummary(
        description="light rain", temp_c=31.4, wind_kph=18.0, rain_mm=2.5
    )
    assert capture["params"]["appid"] == "KEY"
    assert capture["params"]["units"] == "metric"


@pytest.mark.asyncio
async def test_openweather_defaults_missing_fields():
    # No weather list / wind / rain — every field falls back rather than raising.
    provider = OpenWeatherProvider("KEY", client=_FakeClient(_FakeResponse({}), {}))
    summary = await provider.current(0.0, 0.0)
    assert summary == WeatherSummary(description="unknown", temp_c=0.0, wind_kph=0.0, rain_mm=0.0)


@pytest.mark.asyncio
async def test_openweather_raises_on_http_error():
    provider = OpenWeatherProvider("KEY", client=_FakeClient(_FakeResponse({}, status_ok=False), {}))
    with pytest.raises(RuntimeError):
        await provider.current(0.0, 0.0)


def test_as_line_formats_a_context_fragment():
    line = WeatherSummary(description="clear sky", temp_c=33.0, wind_kph=12.0, rain_mm=0.0).as_line()
    assert "clear sky" in line and "33°C" in line


def test_build_returns_stub_when_no_key(monkeypatch):
    monkeypatch.delenv("WEATHER_API_KEY", raising=False)
    assert isinstance(build_weather_provider(), StubWeatherProvider)


def test_build_returns_stub_for_replace_me(monkeypatch):
    monkeypatch.setenv("WEATHER_API_KEY", "REPLACE_ME")
    assert isinstance(build_weather_provider(), StubWeatherProvider)


def test_build_returns_openweather_when_key_set(monkeypatch):
    monkeypatch.setenv("WEATHER_API_KEY", "real-key")
    assert isinstance(build_weather_provider(), OpenWeatherProvider)
