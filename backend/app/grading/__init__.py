"""Server-side answer grading."""

import math
import re
from typing import Any


def normalize_text(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    return re.sub(r"\s+", " ", str(value if value is not None else "").strip()).casefold()


def normalize_list(value: Any) -> list[str]:
    if value is None:
        return []
    if not isinstance(value, (list, tuple, set)):
        value = [value]
    return sorted(normalize_text(item) for item in value)


def math_equivalent(value: Any, expected: Any) -> bool:
    user_input = str(value).strip()
    if len(user_input) > 200 or not re.fullmatch(r"[A-Za-z0-9_+\-*/^().,=\s]+", user_input):
        return False
    try:
        from sympy import sympify
        from sympy.parsing.sympy_parser import (
            convert_xor,
            implicit_multiplication_application,
            standard_transformations,
        )

        transformations = standard_transformations + (
            convert_xor,
            implicit_multiplication_application,
        )
        from sympy.parsing.sympy_parser import parse_expr

        left = parse_expr(str(value).strip(), transformations=transformations)
        right = parse_expr(str(expected).strip(), transformations=transformations)
        difference = sympify(left - right)
        return bool(difference.simplify() == 0)
    except (ImportError, SyntaxError, TypeError, ValueError, AttributeError):
        return normalize_text(value).replace(" ", "") == normalize_text(expected).replace(" ", "")


def grade_value(question_type: str, value: Any, expected: Any) -> bool | None:
    if question_type == "essay":
        return None
    if value is None or value == "" or value == []:
        return False
    if question_type == "multiple":
        return normalize_list(value) == normalize_list(expected)
    if question_type == "math":
        if isinstance(expected, list):
            return any(math_equivalent(value, candidate) for candidate in expected)
        return math_equivalent(value, expected)
    if question_type == "truefalse":
        aliases = {"1": "true", "yes": "true", "đúng": "true", "0": "false", "no": "false", "sai": "false"}
        left = aliases.get(normalize_text(value), normalize_text(value))
        right = aliases.get(normalize_text(expected), normalize_text(expected))
        return left == right
    if question_type in {"fill", "short"} and isinstance(expected, list):
        return any(normalize_text(value) == normalize_text(candidate) for candidate in expected)
    if question_type == "matching":
        if isinstance(value, dict) and isinstance(expected, dict):
            return {str(k): normalize_text(v) for k, v in value.items()} == {
                str(k): normalize_text(v) for k, v in expected.items()
            }
        return normalize_list(value) == normalize_list(expected)
    return normalize_text(value) == normalize_text(expected)


def clean_score(value: float) -> float:
    if math.isclose(value, round(value), abs_tol=1e-9):
        return float(round(value))
    return round(value, 2)
