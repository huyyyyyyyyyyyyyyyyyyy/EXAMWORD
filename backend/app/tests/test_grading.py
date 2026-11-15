from app.grading import grade_value


def test_supported_server_grading_types():
    assert grade_value("single", " a ", "A") is True
    assert grade_value("multiple", ["B", "A"], ["a", "b"]) is True
    assert grade_value("truefalse", "Đúng", True) is True
    assert grade_value("fill", "  Hà   Nội ", "hà nội") is True
    assert grade_value("short", "went", ["went", "gone"]) is True
    assert grade_value("math", "x+x", "2*x") is True
    assert grade_value("essay", "A response", None) is None
    assert grade_value("matching", {"1": "A"}, {"1": "a"}) is True
    assert grade_value("single", None, "A") is False
