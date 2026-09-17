import re
from pathlib import Path

ADR_PATH = (
    Path(__file__).resolve().parents[2]
    / "docs"
    / "adr"
    / "0001-account-identity-reference-stub.md"
)


def test_adr_stub_documents_future_identity_reference():
    text = ADR_PATH.read_text()
    assert "account-identity reference" in text.lower()
    assert not re.search(r"FTP-[A-Z]+-\d+", text)
