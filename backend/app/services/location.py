"""Helpers for comparing Vietnamese free-text locations without exposing addresses."""

import re
import unicodedata


_CURRENT_PROVINCES = {
    "an giang",
    "bac ninh",
    "cao bang",
    "ca mau",
    "can tho",
    "da nang",
    "dak lak",
    "dien bien",
    "dong nai",
    "dong thap",
    "gia lai",
    "ha noi",
    "ha tinh",
    "hai phong",
    "ho chi minh",
    "hue",
    "hung yen",
    "khanh hoa",
    "lai chau",
    "lam dong",
    "lang son",
    "lao cai",
    "nghe an",
    "ninh binh",
    "phu tho",
    "quang ngai",
    "quang ninh",
    "quang tri",
    "son la",
    "tay ninh",
    "thanh hoa",
    "thai nguyen",
    "tuyen quang",
    "vinh long",
}

_PROVINCE_ALIASES = {
    "hcm": "ho chi minh",
    "tp hcm": "ho chi minh",
    "tphcm": "ho chi minh",
    "tp ho chi minh": "ho chi minh",
    "sai gon": "ho chi minh",
    "hn": "ha noi",
    "tp hn": "ha noi",
    "tp ha noi": "ha noi",
}


def _normalize_text(value: str) -> str:
    normalized = unicodedata.normalize("NFD", value.lower().strip())
    normalized = "".join(char for char in normalized if unicodedata.category(char) != "Mn")
    normalized = normalized.replace("đ", "d")
    normalized = re.sub(r"\btp\s*\.?\s*hcm\b", "ho chi minh", normalized)
    normalized = re.sub(r"\btphcm\b", "ho chi minh", normalized)
    normalized = re.sub(r"\bq\s*\.?\s*(\d+)\b", r"quan \1", normalized)
    normalized = re.sub(r"[^a-z0-9,\s]", " ", normalized)
    return re.sub(r"\s+", " ", normalized).strip()


def _canonical_province(segment: str) -> str | None:
    normalized = _normalize_text(segment)
    normalized = _PROVINCE_ALIASES.get(normalized, normalized)
    normalized = re.sub(r"^(tinh|thanh pho)\s+", "", normalized).strip()
    return normalized if normalized in _CURRENT_PROVINCES else None


def _canonical_locality(segment: str) -> str:
    normalized = _normalize_text(segment)
    without_prefix = re.sub(
        r"^(quan|huyen|phuong|xa|thi xa|thi tran|thanh pho)\s+",
        "",
        normalized,
    ).strip()
    if without_prefix and not without_prefix.isdigit():
        return without_prefix
    return normalized


def _location_parts(value: str | None) -> tuple[set[str], str | None]:
    if not value or not value.strip():
        return set(), None

    segments = [
        segment.strip()
        for segment in re.split(r"[,;/]", value)
        if segment.strip()
    ]
    province = None
    locality_segments = segments

    if segments:
        province = _canonical_province(segments[-1])
        if province:
            locality_segments = segments[:-1]

    localities = {
        locality
        for locality in (_canonical_locality(segment) for segment in locality_segments)
        if locality
    }
    return localities, province


def location_match_level(left: str | None, right: str | None) -> int:
    """Return 2 for same local area, 1 for same province/city, otherwise 0."""

    left_localities, left_province = _location_parts(left)
    right_localities, right_province = _location_parts(right)

    if left_localities and right_localities:
        if left_localities.intersection(right_localities):
            return 2
        if any(
            left_part in right_part or right_part in left_part
            for left_part in left_localities
            for right_part in right_localities
            if min(len(left_part), len(right_part)) >= 4
        ):
            return 2

    if left_province and left_province == right_province:
        return 1

    return 0


def best_location_match_level(source: str | None, *targets: str | None) -> int:
    return max((location_match_level(source, target) for target in targets), default=0)
