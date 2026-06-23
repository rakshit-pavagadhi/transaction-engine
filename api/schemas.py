from pydantic import BaseModel, Field
from typing import Optional

class TransactionRequest(BaseModel):
    user_id: str = Field(..., min_length=1)
    amount: float = Field(..., gt=0, le=100000, description="Amount must be positive and not abusive")
    idempotency_key: str = Field(..., min_length=1)

class TransactionResponse(BaseModel):
    transaction_id: str
    user_id: str
    amount: float
    status: str

class UserSummary(BaseModel):
    user_id: str
    total_amount: float
    transaction_count: int
    score: float
    rank: Optional[int] = None

class RankingResponse(BaseModel):
    rankings: list[UserSummary]