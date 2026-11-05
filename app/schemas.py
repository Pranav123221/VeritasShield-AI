
from typing import Literal

from pydantic import BaseModel, Field, HttpUrl


Verdict = Literal[
    "Supported",
    "Contradicted",
    "Inconclusive",
]

Relationship = Literal[
    "Supports",
    "Contradicts",
    "Neutral",
]

Reliability = Literal[
    "High",
    "Moderate",
    "Limited",
    "Unknown",
]


class VerifyRequest(BaseModel):
    claim: str = Field(
        min_length=8,
        max_length=2000,
        description="A factual claim to investigate",
    )


class EvidenceSource(BaseModel):
    title: str
    url: HttpUrl
    publisher: str = "Unknown"

    relationship: Relationship = "Neutral"

    evidence: str = ""
    relevance: str = ""

    reliability: Reliability = "Unknown"
    reliability_reason: str = ""
    limitations: str = ""


class VerifyResponse(BaseModel):
    claim: str

    verdict: Verdict
    assessment: str

    evidence_summary: str
    uncertainty: str

    sources: list[EvidenceSource] = Field(
        default_factory=list
    )

    model: str


from typing import Literal

from pydantic import BaseModel, Field, HttpUrl


Verdict = Literal[
    "Supported",
    "Contradicted",
    "Inconclusive",
]

Relationship = Literal[
    "Supports",
    "Contradicts",
    "Neutral",
]

Reliability = Literal[
    "High",
    "Moderate",
    "Limited",
    "Unknown",
]


class VerifyRequest(BaseModel):
    claim: str = Field(
        min_length=8,
        max_length=2000,
        description="A factual claim to investigate",
    )


class EvidenceSource(BaseModel):
    title: str
    url: HttpUrl
    publisher: str = "Unknown"
    relationship: Relationship = "Neutral"
    evidence: str = ""
    relevance: str = ""
    reliability: Reliability = "Unknown"
    reliability_reason: str = ""
    limitations: str = ""


class VerifyResponse(BaseModel):
    claim: str
    verdict: Verdict
    assessment: str
    evidence_summary: str
    uncertainty: str
    sources: list[EvidenceSource] = Field(default_factory=list)
    model: str


class URLInvestigationRequest(BaseModel):
    url: HttpUrl


class URLClaimResult(BaseModel):
    claim: str
    context: str = ""
    verdict: Verdict = "Inconclusive"
    assessment: str = ""
    evidence_summary: str = ""
    uncertainty: str = ""
    sources: list[EvidenceSource] = Field(default_factory=list)
    model: str = "Unknown"


class URLInvestigationResponse(BaseModel):
    status: str
    investigation_type: str = "url"
    submitted_url: str
    final_url: str
    page_title: str
    page_description: str = ""
    page_summary: str = ""
    claims: list[URLClaimResult] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    model: str
