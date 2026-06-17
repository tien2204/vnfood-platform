import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))

import seed_flavor_text as s


def test_build_prompt_mentions_title_and_inputs():
    p = s.build_prompt("Bánh bèo", "Là món ăn dân dã đặc trưng miền Trung.", ["Bột gạo", "Tôm khô"])
    assert "Bánh bèo" in p
    assert "Tôm khô" in p
    # instructs judge-and-rewrite with the keep flag + flavor_text key
    assert "keep" in p
    assert "flavor_text" in p


def test_build_prompt_handles_empty_description():
    p = s.build_prompt("Phở bò", None, [])
    assert "Phở bò" in p
    assert isinstance(p, str) and len(p) > 0
