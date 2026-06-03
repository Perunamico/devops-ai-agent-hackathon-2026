from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from token_service import TokenService

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_svc = TokenService()


class TokenResponse(BaseModel):
    token: str
    frequencies: list[int]
    expires_at: str


@app.post("/token", response_model=TokenResponse)
def issue_token():
    token, expires_at = _svc.generate_exchange_token()
    frequencies = _svc.encode_token_to_frequencies(token)
    return TokenResponse(token=token, frequencies=frequencies, expires_at=expires_at.isoformat())
