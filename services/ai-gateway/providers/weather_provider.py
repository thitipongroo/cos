"""Weather provider (§22.4 delay-risk input).

The delay-risk analysis (report-delay-risk-v1) weighs weather alongside workforce, procurement, and
schedule signals. Weather is an *enrichment*, never load-bearing: when no key is configured the
provider degrades to ``None`` — exactly the StubLLMProvider posture — and the context assembly simply
omits weather rather than fabricating a forecast (ห้ามเดา — never invent data).

Primary implementation is OpenWeather (current conditions by project lat/lng). The HTTP client is an
injectable seam so tests exercise the mapping without a network call or a provisioned key.
"""

from __future__ import annotations

import os
from abc import ABC, abstractmethod
from dataclasses import dataclass

_OPENWEATHER_URL = "https://api.openweathermap.org/data/2.5/weather"


@dataclass
class WeatherSummary:
    description: str
    temp_c: float
    wind_kph: float
    rain_mm: float

    def as_line(self) -> str:
        """One-line context fragment for the delay-risk prompt."""
        return (
            f"Weather: {self.description}, {self.temp_c:.0f}°C, "
            f"wind {self.wind_kph:.0f} km/h, rain {self.rain_mm:.1f} mm/h"
        )


class WeatherProvider(ABC):
    @abstractmethod
    async def current(self, lat: float, lng: float) -> WeatherSummary | None: ...


class StubWeatherProvider(WeatherProvider):
    """No key configured — degrade to no weather (the context omits it)."""

    async def current(self, lat: float, lng: float) -> WeatherSummary | None:
        return None


class OpenWeatherProvider(WeatherProvider):
    """OpenWeather current-conditions by coordinate. `client` is an injectable httpx.AsyncClient."""

    def __init__(self, api_key: str, client=None, base_url: str = _OPENWEATHER_URL) -> None:
        self._api_key = api_key
        self._base_url = base_url
        if client is not None:
            self._client = client
        else:
            import httpx

            self._client = httpx.AsyncClient(timeout=10.0)

    async def current(self, lat: float, lng: float) -> WeatherSummary | None:
        resp = await self._client.get(
            self._base_url,
            params={"lat": lat, "lon": lng, "appid": self._api_key, "units": "metric"},
        )
        resp.raise_for_status()
        data = resp.json()
        weather = data.get("weather") or [{}]
        return WeatherSummary(
            description=weather[0].get("description", "unknown"),
            temp_c=float(data.get("main", {}).get("temp", 0.0)),
            # OpenWeather returns wind speed in m/s (metric units) → km/h.
            wind_kph=float(data.get("wind", {}).get("speed", 0.0)) * 3.6,
            rain_mm=float((data.get("rain") or {}).get("1h", 0.0)),
        )


def build_weather_provider() -> WeatherProvider:
    """Real provider when WEATHER_API_KEY is configured, otherwise the stub. REPLACE_ME counts as absent."""
    key = os.environ.get("WEATHER_API_KEY", "").strip()
    if key and key != "REPLACE_ME":
        return OpenWeatherProvider(key)
    return StubWeatherProvider()
