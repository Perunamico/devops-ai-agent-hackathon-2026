from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field


class PetCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    personality: str = Field(..., max_length=200)
    tone: str = Field(..., max_length=200)


class PetResponse(BaseModel):
    pet_id: str
    user_id: str
    name: str
    personality: str
    tone: str
    created_at: str


class UserInputCreate(BaseModel):
    input_type: Literal["chat", "diary", "interest_tag"]
    content: str = Field(..., min_length=1, max_length=2000)
