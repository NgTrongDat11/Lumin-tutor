from app.services.location import best_location_match_level, location_match_level


def test_matches_legacy_district_notation():
    assert location_match_level("Quận 1, TP.HCM", "Q.1, Thành phố Hồ Chí Minh") == 2


def test_matches_named_district_with_or_without_prefix():
    assert location_match_level("Bình Thạnh, TP.HCM", "Quận Bình Thạnh, TP.HCM") == 2


def test_distinguishes_numeric_ward_from_numeric_district():
    assert location_match_level("Phường 1, TP.HCM", "Quận 1, TP.HCM") == 1


def test_returns_province_level_match_for_different_localities():
    assert location_match_level(
        "Phường Bến Thành, Thành phố Hồ Chí Minh",
        "Phường Thủ Đức, Thành phố Hồ Chí Minh",
    ) == 1


def test_uses_best_of_account_address_and_teaching_area():
    assert best_location_match_level(
        "Quận 7, TP.HCM",
        "Quận 3, TP.HCM",
        "Quận 7, TP.HCM",
    ) == 2
